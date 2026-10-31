// Central state hook: owns the deck (card states + review log + settings),
// persists settings to localStorage, and orchestrates GitHub load/save.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SEED_VOCAB } from '../data/vocab.js'
import { cardKey, newCardState, reviewCard, isDue } from '../lib/fsrs.js'
import { fetchProgress, saveProgress, putTextFile } from '../lib/github.js'
import { DEFAULT_DATA_REPO, dataPath, effectiveGithub, storageKey } from '../lib/dataMode.js'
import { freshV3 } from '../lib/schema.js'
import { migrate, needsPreV3Backup } from '../lib/migrate.js'
import { mergeProgress } from '../lib/merge.js'
import { archiveLog } from '../lib/logArchive.js'
import { retirePlaceholderGoals } from '../lib/goals.js'
import { localDate } from '../lib/dates.js'
import { noteActivity } from '../lib/sessions.js'

const SAVE_DEBOUNCE_MS = 4000
const MAX_SAVE_TRIES = 3

const SETTINGS_KEY = storageKey('settings')
const LOCAL_PROGRESS_KEY = storageKey('progress')
const ARCHIVE_DAY_KEY = storageKey('logArchiveDay')

// Log archiving runs at most once per local day per device (DESIGN §7).
function archiveDoneToday(tz) {
  try { return localStorage.getItem(ARCHIVE_DAY_KEY) === localDate(new Date(), tz) } catch { return false }
}
function markArchiveDone(tz) {
  try { localStorage.setItem(ARCHIVE_DAY_KEY, localDate(new Date(), tz)) } catch { /* private mode */ }
}
export function clearLogArchiveStamp() {
  try { localStorage.removeItem(ARCHIVE_DAY_KEY) } catch { /* private mode */ }
}

const DEFAULT_SETTINGS = {
  github: { token: '', owner: '', repo: '', branch: 'main', path: 'progress.json' }, // owner/repo/branch/path ignored since Phase 1A
  data: { owner: DEFAULT_DATA_REPO.owner, repo: DEFAULT_DATA_REPO.repo },
  aiProvider: 'claude', // 'claude' | 'deepseek'
  claudeApiKey: '',
  claudeModel: 'claude-sonnet-4-20250514',
  deepseekApiKey: '',
  deepseekModel: 'deepseek-chat',
  enabledBands: ['Novice'],
  unlockedBands: ['Novice'],
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return structuredClone(DEFAULT_SETTINGS)
    const stored = JSON.parse(raw)
    const base = structuredClone(DEFAULT_SETTINGS)
    return {
      ...base,
      ...stored,
      github: { ...base.github, ...stored.github },
      data: { ...base.data, ...stored.data },
    }
  } catch {
    return structuredClone(DEFAULT_SETTINGS)
  }
}

function loadLocalProgress() {
  try {
    const raw = localStorage.getItem(LOCAL_PROGRESS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// A fresh progress object (schema v3). Cards exist only for items that have
// been rated (DESIGN §5.1); a missing card means "new".
function freshProgress() {
  return freshV3({})
}

// migrate() throws on a file from a newer app version. Returns
// { progress, error }: on error the input is kept as-is so local state isn't lost.
function migrateSafe(raw) {
  try {
    return { progress: migrate(raw, { device: navigator.userAgent.slice(0, 60) }), error: null }
  } catch (e) {
    return { progress: raw, error: e }
  }
}

function stamp() {
  const d = new Date()
  const z = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`
}

// Re-key legacy records onto the composite hanzi+pinyin key and re-attach
// hanzi/pinyin to existing cards. Never creates cards (no stubs, DESIGN §6.1).
//
// Never drop a card we can't map yet: vocab packs load AFTER the first
// reconcile, so a record whose word isn't loaded right now is preserved under
// its original key and re-mapped on a later pass once the pack arrives.
// Dropping it would truncate progress.json.
function reconcile(progress, vocab) {
  const p = progress ? { ...progress } : freshProgress() // shallow copy: never mutate state
  if (!p.cards) p.cards = {}

  // Indexes for re-keying legacy records.
  const vocabById = Object.fromEntries(
    vocab.filter((v) => v.id != null).map((v) => [v.id, v])
  )
  const byHanzi = {}
  for (const v of vocab) (byHanzi[v.hanzi] ||= []).push(v)

  const migrated = {}
  // Modern keys (hanzi|pinyin, or hanzi|pinyin#POS for an extra sense) stay
  // exactly where they are. Re-keying them from card contents could collide
  // and silently overwrite another card. Only legacy keys are re-mapped below.
  for (const [key, card] of Object.entries(p.cards)) {
    if (key.includes('|')) migrated[key] = card
  }
  const place = (k, card, fallbackKey) => {
    if (migrated[k] === undefined) migrated[k] = card
    else migrated[fallbackKey] = card // target taken: keep the legacy record untouched
  }
  for (const [key, card] of Object.entries(p.cards)) {
    if (key.includes('|')) continue
    if (card.hanzi && card.pinyin != null && card.pinyin !== '') {
      // Legacy key, self-describing card: key it from the card.
      place(cardKey(card), card, key)
    } else if (card.hanzi) {
      // Legacy hanzi-only card (pre-pinyin schema). Disambiguate by reading
      // when the hanzi maps to exactly one word; otherwise keep it untouched
      // rather than guess and mis-attribute review history.
      const matches = byHanzi[card.hanzi] || []
      if (matches.length === 1) {
        const w = matches[0]
        place(cardKey(w), { ...card, hanzi: w.hanzi, pinyin: w.pinyin ?? '' }, key)
      } else {
        migrated[key] = card
      }
    } else if (vocabById[key]) {
      // Very old id-keyed card.
      const w = vocabById[key]
      place(cardKey(w), { ...card, hanzi: w.hanzi, pinyin: w.pinyin ?? '' }, key)
    } else {
      // Unmappable for now (pack not loaded) — keep as-is for a later pass.
      migrated[key] = card
    }
  }
  p.cards = migrated

  if (!p.log) p.log = []
  return p
}

export function useProgress(vocab = SEED_VOCAB) {
  const [settings, setSettings] = useState(loadSettings)
  const [initial] = useState(() => {
    const { progress: p, error } = migrateSafe(loadLocalProgress())
    return { progress: reconcile(p, vocab), error }
  })
  const [progress, setProgress] = useState(initial.progress)
  const [syncState, setSyncState] = useState(
    initial.error ? { status: 'error', message: initial.error.message } : { status: 'idle', message: '' }
  )
  const saveTimer = useRef(null)
  const blockedRef = useRef(Boolean(initial.error)) // newer schema: never save
  const backupCheckedRef = useRef(false) // pre-v3 backup decided for this session
  const savingRef = useRef(false) // one save at a time
  const dirtyRef = useRef(false) // local changes not yet saved
  const latestRef = useRef(initial.progress) // always the newest local state
  const saveRef = useRef(null)
  const [pullSettled, setPullSettled] = useState(false) // first pull finished (ok or failed)

  // Single entry point for state changes so latestRef never lags behind.
  const apply = useCallback((fn) => {
    const next = fn(latestRef.current)
    if (next === latestRef.current) return false
    latestRef.current = next
    setProgress(next)
    return true
  }, [])

  // When the vocab list changes (packs loaded), re-key cards for the new words.
  useEffect(() => {
    apply((prev) => reconcile(prev, vocab))
  }, [vocab, apply])

  // Persist settings locally whenever they change.
  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  }, [settings])

  // Persist progress locally on every change (instant offline fallback).
  useEffect(() => {
    localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(progress))
  }, [progress])

  const gh = useMemo(
    () => effectiveGithub(settings),
    [settings.github.token, settings.data.owner, settings.data.repo] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const githubReady = Boolean(gh.token && gh.owner && gh.repo)

  const block = useCallback((message) => {
    blockedRef.current = true
    setSyncState({ status: 'error', message })
  }, [])

  // Pull latest from GitHub and merge it into local state (never replaces).
  const pull = useCallback(async () => {
    if (!githubReady) return
    setSyncState({ status: 'syncing', message: 'Loading from GitHub…' })
    try {
      const { data } = await fetchProgress(gh)
      if (data) {
        const { progress: remote, error } = migrateSafe(data)
        if (error) return block(error.message)
        apply((prev) => retirePlaceholderGoals(reconcile(mergeProgress(prev, remote), vocab)))
        setSyncState({ status: 'ok', message: 'Synced' })
      } else {
        setSyncState({ status: 'ok', message: 'No remote file yet — will create on first save' })
      }
    } catch (e) {
      setSyncState({ status: 'error', message: e.message })
    } finally {
      setPullSettled(true)
    }
  }, [githubReady, gh, vocab, apply, block])

  // Merge-on-save (DESIGN §7): fetch remote → migrate → merge → PUT with sha;
  // on a stale-sha conflict repeat, max MAX_SAVE_TRIES.
  const save = useCallback(async () => {
    if (!githubReady || blockedRef.current || savingRef.current) return
    savingRef.current = true
    clearTimeout(saveTimer.current)
    setSyncState({ status: 'syncing', message: 'Saving…' })
    try {
      for (let attempt = 0; attempt < MAX_SAVE_TRIES; attempt++) {
        const { data: rawRemote, sha } = await fetchProgress(gh)
        let remote
        if (rawRemote) {
          const m = migrateSafe(rawRemote)
          if (m.error) return block(m.error.message) // newer schema: no merge, no save
          remote = m.progress
        } else {
          remote = freshV3() // first save on a new path
        }

        // Back up a pre-v3 remote file untouched before the first v3 save
        // (DESIGN §6.2). If that fails, save nothing; the next save retries.
        let backupPath = null
        if (!backupCheckedRef.current && needsPreV3Backup(rawRemote)) {
          backupPath = dataPath(`backups/progress-pre-v3-${stamp()}.json`)
          try {
            await putTextFile(gh, backupPath, JSON.stringify(rawRemote, null, 2), undefined, `backup before v3: ${backupPath}`)
          } catch {
            setSyncState({ status: 'error', message: 'Backup failed — not saving' })
            return
          }
        }
        backupCheckedRef.current = true

        dirtyRef.current = false // everything in latestRef right now goes into this PUT
        let merged = mergeProgress(latestRef.current, remote)
        if (backupPath) {
          merged = {
            ...merged,
            migrations: merged.migrations.map((m) =>
              m.backupPath == null && m.from < 3 ? { ...m, backupPath } : m
            ),
          }
        }
        // Move old log entries to log/YYYY-MM.json (guarded writes). Any failure leaves `merged`
        // untouched; the PUT still goes ahead and archiving retries on a later save.
        const tz = merged.studySettings?.timeZone
        if (!archiveDoneToday(tz)) {
          const r = await archiveLog(gh, merged, new Date())
          if (r.error) console.warn('Log archive failed:', r.error)
          else { merged = r.progress; markArchiveDone(tz) }
        }
        const payload = { ...merged, updatedAt: new Date().toISOString() }
        const res = await saveProgress(gh, payload, sha)
        if (res.ok) {
          // Keep any local changes made while saving.
          apply((prev) => reconcile(mergeProgress(prev, payload), vocab))
          setSyncState({ status: 'ok', message: 'Synced' })
          return
        }
        // conflict: another device pushed between our GET and PUT → refetch, re-merge
      }
      dirtyRef.current = true
      setSyncState({ status: 'error', message: 'Sync conflict: another device kept saving. Will retry on the next change.' })
    } catch (e) {
      dirtyRef.current = true
      setSyncState({ status: 'error', message: e.message })
    } finally {
      savingRef.current = false
      // A change made during the save schedules another save afterwards.
      if (dirtyRef.current && !blockedRef.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(() => saveRef.current?.(), SAVE_DEBOUNCE_MS)
      }
    }
  }, [githubReady, gh, vocab, apply, block])
  saveRef.current = save

  // On first mount, if GitHub is configured, pull.
  useEffect(() => {
    if (githubReady) pull()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Flush unsaved changes the moment the page is hidden (phone lock, tab switch).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && dirtyRef.current) saveRef.current?.()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      clearTimeout(saveTimer.current)
    }
  }, [])

  const scheduleSync = useCallback(() => {
    if (!githubReady) return
    dirtyRef.current = true
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveRef.current?.(), SAVE_DEBOUNCE_MS)
  }, [githubReady])

  // Rate a card; update FSRS state + append to log; schedule a sync.
  // Accepts the composite card key (string) or a vocab/word object, from which
  // the key is derived.
  const rate = useCallback(
    (wordOrKey, ratingKey, listIds = []) => {
      const key = typeof wordOrKey === 'string' ? wordOrKey : cardKey(wordOrKey)
      const prev = latestRef.current
      let card = prev.cards[key]
      if (!card) {
        // First rating: create the card now (no stubs, DESIGN §5.1).
        const word =
          typeof wordOrKey === 'string'
            ? { key, hanzi: key.split('|')[0], pinyin: key.split('|').slice(1).join('|').split('#')[0] }
            : wordOrKey
        if (!word.hanzi || !key.includes('|')) return
        card = newCardState(word)
      }
      const nowIso = new Date().toISOString()
      const updated = {
        ...reviewCard(card, ratingKey),
        firstSeen: card.firstSeen ?? (card.reps === 0 ? nowIso : null),
      }
      apply(() => ({
        ...prev,
        cards: { ...prev.cards, [key]: updated },
        log: [
          ...prev.log,
          {
            key,
            hanzi: card.hanzi,
            pinyin: card.pinyin,
            rating: ratingKey,
            at: nowIso,
          },
        ], // no cap: old entries move to log archive files (DESIGN §8.5, Phase 6)
      }))
      noteActivity('flashcards', listIds, 'review')
      scheduleSync()
    },
    [scheduleSync, apply]
  )

  // Restore only (DESIGN §7): PUT `data` as-is, no merge, over whatever is
  // remote. The caller has already backed up the remote file.
  const forcePush = useCallback(
    async (data) => {
      if (!githubReady || blockedRef.current) return
      if (!(data && typeof data.cards === 'object' && data.cards)) return // never an unmerged push of anything else
      clearTimeout(saveTimer.current)
      setSyncState({ status: 'syncing', message: 'Saving…' })
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const { sha } = await fetchProgress(gh)
          const res = await saveProgress(gh, { ...data, updatedAt: new Date().toISOString() }, sha)
          if (res.ok) {
            setSyncState({ status: 'ok', message: 'Synced' })
            return
          }
        }
        setSyncState({ status: 'error', message: 'Sync conflict during restore. Try again.' })
      } catch (e) {
        setSyncState({ status: 'error', message: e.message })
      }
    },
    [githubReady, gh]
  )

  // Apply fn(progress) → progress and schedule a save (DESIGN §8.5 snapshots, settings edits).
  const updateProgress = useCallback(
    (fn) => {
      // Save only when something actually changed (an unchanged snapshot must not commit).
      if (apply(fn)) scheduleSync()
    },
    [apply, scheduleSync]
  )

  // Retire the old June / Jul–Dec placeholder goals on load (DESIGN §5.5); a no-op once done.
  // Runs again after the first pull, since a remote file may still carry them.
  useEffect(() => {
    if (blockedRef.current) return
    updateProgress((prev) => retirePlaceholderGoals(prev))
  }, [updateProgress, pullSettled])

  // Merge a patch into progress.studySettings (synced) and stamp updatedAt.
  const updateStudySettings = useCallback(
    (patch) => {
      updateProgress((prev) => ({
        ...prev,
        studySettings: { ...prev.studySettings, ...patch, updatedAt: new Date().toISOString() },
      }))
    },
    [updateProgress]
  )

  const addSession = useCallback(
    (s) => updateProgress((prev) => ({ ...prev, sessions: [...(prev.sessions ?? []), s] })),
    [updateProgress]
  )

  // Insert or replace a manual entry by id (deletes are tombstones: deleted: true).
  const upsertManualEntry = useCallback(
    (e) => updateProgress((prev) => {
      const list = prev.manualEntries ?? []
      const i = list.findIndex((x) => x.id === e.id)
      return { ...prev, manualEntries: i < 0 ? [...list, e] : list.map((x, j) => (j === i ? e : x)) }
    }),
    [updateProgress]
  )

  const updateSettings = useCallback((patch) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  // Replace local state wholesale (Restore). Migrates first. Returns the
  // migrated progress to push, or null if the file is from a newer app version.
  const replaceProgress = useCallback(
    (data) => {
      const { progress: migrated, error } = migrateSafe(data)
      if (error) {
        block(error.message)
        return null
      }
      const next = retirePlaceholderGoals(reconcile(migrated, vocab))
      latestRef.current = next
      setProgress(next)
      return next
    },
    [vocab, block]
  )

  return {
    settings,
    updateSettings,
    progress,
    updateProgress,
    updateStudySettings,
    addSession,
    upsertManualEntry,
    // Data is ready for a snapshot: migration succeeded and the first pull settled (or no GitHub).
    dataReady: !initial.error && (!githubReady || pullSettled),
    isBlocked: () => blockedRef.current,
    replaceProgress,
    gh,
    rate,
    syncState,
    pull,
    saveNow: save, // merge-save immediately (Settings → Push now)
    forcePush, // Restore only: no merge
    githubReady,
    isDue,
  }
}
