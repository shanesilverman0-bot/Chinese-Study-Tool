// Central state hook: owns the deck (card states + review log + settings),
// persists settings to localStorage, and orchestrates GitHub load/save.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SEED_VOCAB } from '../data/vocab.js'
import { cardKey, newCardState, reviewCard, isDue } from '../lib/fsrs.js'
import { fetchProgress, saveProgress, putTextFile } from '../lib/github.js'
import { DEFAULT_DATA_REPO, dataPath, effectiveGithub, storageKey } from '../lib/dataMode.js'
import { freshV3 } from '../lib/schema.js'
import { migrate, needsPreV3Backup } from '../lib/migrate.js'

const SETTINGS_KEY = storageKey('settings')
const LOCAL_PROGRESS_KEY = storageKey('progress')

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
  const p = progress || freshProgress()
  if (!p.cards) p.cards = {}

  // Indexes for re-keying legacy records.
  const vocabById = Object.fromEntries(
    vocab.filter((v) => v.id != null).map((v) => [v.id, v])
  )
  const byHanzi = {}
  for (const v of vocab) (byHanzi[v.hanzi] ||= []).push(v)

  const migrated = {}
  for (const [key, card] of Object.entries(p.cards)) {
    if (card.hanzi && card.pinyin != null && card.pinyin !== '') {
      // Already self-describing (hanzi + pinyin) — key directly from the card.
      migrated[cardKey(card)] = card
    } else if (card.hanzi) {
      // Legacy hanzi-only card (pre-pinyin schema). Disambiguate by reading
      // when the hanzi maps to exactly one word; otherwise keep it untouched
      // rather than guess and mis-attribute review history.
      const matches = byHanzi[card.hanzi] || []
      if (matches.length === 1) {
        const w = matches[0]
        migrated[cardKey(w)] = { ...card, hanzi: w.hanzi, pinyin: w.pinyin ?? '' }
      } else {
        migrated[key] = card
      }
    } else if (vocabById[key]) {
      // Very old id-keyed card.
      const w = vocabById[key]
      migrated[cardKey(w)] = { ...card, hanzi: w.hanzi, pinyin: w.pinyin ?? '' }
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
  const shaRef = useRef(null)
  const saveTimer = useRef(null)
  const blockedRef = useRef(Boolean(initial.error)) // newer schema: never save
  const backupCheckedRef = useRef(false) // pre-v3 backup decided for this session

  // When the vocab list changes (packs loaded), re-key cards for the new words.
  useEffect(() => {
    setProgress((prev) => reconcile(prev, vocab))
  }, [vocab])

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

  // Pull latest from GitHub.
  const pull = useCallback(async () => {
    if (!githubReady) return
    setSyncState({ status: 'syncing', message: 'Loading from GitHub…' })
    try {
      const { data, sha } = await fetchProgress(gh)
      shaRef.current = sha
      if (data) {
        const { progress: migrated, error } = migrateSafe(data)
        if (error) {
          blockedRef.current = true
          setSyncState({ status: 'error', message: error.message })
          return
        }
        setProgress(reconcile(migrated, vocab))
        setSyncState({ status: 'ok', message: 'Synced' })
      } else {
        setSyncState({ status: 'ok', message: 'No remote file yet — will create on first save' })
      }
    } catch (e) {
      setSyncState({ status: 'error', message: e.message })
    }
  }, [githubReady, gh, vocab])

  // Push current progress to GitHub (debounced by caller via scheduleSync).
  const push = useCallback(
    async (data) => {
      if (!githubReady || blockedRef.current) return
      setSyncState({ status: 'syncing', message: 'Saving…' })
      try {
        const payload = { ...data, updatedAt: new Date().toISOString() }

        // Before the first save of the session, back up a pre-v3 remote file
        // untouched (DESIGN §6.2). If that fails, save nothing; the next push retries.
        if (!backupCheckedRef.current) {
          const remote = await fetchProgress(gh)
          if (remote.data && remote.data.schemaVersion > payload.schemaVersion) {
            blockedRef.current = true
            setSyncState({
              status: 'error',
              message: `progress.json is from a newer app version (schemaVersion ${remote.data.schemaVersion}). Reload the app.`,
            })
            return
          }
          if (needsPreV3Backup(remote.data)) {
            const path = dataPath(`backups/progress-pre-v3-${stamp()}.json`)
            try {
              await putTextFile(gh, path, JSON.stringify(remote.data, null, 2), undefined, `backup before v3: ${path}`)
            } catch (e) {
              setSyncState({ status: 'error', message: 'Backup failed — not saving' })
              return
            }
            const migrations = [...(payload.migrations || [])]
            const last = migrations.length - 1
            if (last >= 0 && migrations[last].backupPath == null) {
              migrations[last] = { ...migrations[last], backupPath: path }
              payload.migrations = migrations
              setProgress((prev) => ({ ...prev, migrations }))
            }
          }
          backupCheckedRef.current = true
        }
        const { sha } = await saveProgress(gh, payload, shaRef.current)
        shaRef.current = sha
        setSyncState({ status: 'ok', message: 'Synced' })
      } catch (e) {
        setSyncState({ status: 'error', message: e.message })
      }
    },
    [githubReady, gh]
  )

  // On first mount, if GitHub is configured, pull.
  useEffect(() => {
    if (githubReady) pull()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const scheduleSync = useCallback(
    (data) => {
      if (!githubReady) return
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => push(data), 1500)
    },
    [githubReady, push]
  )

  // Rate a card; update FSRS state + append to log; schedule a sync.
  // Accepts the composite card key (string) or a vocab/word object, from which
  // the key is derived.
  const rate = useCallback(
    (wordOrKey, ratingKey) => {
      const key = typeof wordOrKey === 'string' ? wordOrKey : cardKey(wordOrKey)
      setProgress((prev) => {
        let card = prev.cards[key]
        if (!card) {
          // First rating: create the card now (no stubs, DESIGN §5.1).
          const word =
            typeof wordOrKey === 'string'
              ? { hanzi: key.split('|')[0], pinyin: key.split('|').slice(1).join('|') }
              : wordOrKey
          if (!word.hanzi || !key.includes('|')) return prev
          card = newCardState(word)
        }
        const nowIso = new Date().toISOString()
        const updated = {
          ...reviewCard(card, ratingKey),
          firstSeen: card.firstSeen ?? (card.reps === 0 ? nowIso : null),
        }
        const next = {
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
          ].slice(-5000),
        }
        scheduleSync(next)
        return next
      })
    },
    [scheduleSync]
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
        blockedRef.current = true
        setSyncState({ status: 'error', message: error.message })
        return null
      }
      const next = reconcile(migrated, vocab)
      setProgress(next)
      return next
    },
    [vocab]
  )

  return {
    settings,
    updateSettings,
    progress,
    replaceProgress,
    gh,
    rate,
    syncState,
    pull,
    // Only a real progress object may be pushed; anything else (e.g. a click
    // event from onClick={forcePush}) falls back to the current progress.
    forcePush: (data) => push(data && typeof data.cards === 'object' && data.cards ? data : progress),
    githubReady,
    isDue,
  }
}
