// Central state hook: owns the deck (card states + review log + settings),
// persists settings to localStorage, and orchestrates GitHub load/save.

import { useCallback, useEffect, useRef, useState } from 'react'
import { SEED_VOCAB } from '../data/vocab.js'
import { cardKey, newCardState, reviewCard, isDue } from '../lib/fsrs.js'
import { fetchProgress, saveProgress } from '../lib/github.js'

const SETTINGS_KEY = 'tocfl.settings'
const LOCAL_PROGRESS_KEY = 'tocfl.progress'

const DEFAULT_SETTINGS = {
  github: { token: '', owner: '', repo: '', branch: 'main', path: 'progress.json' },
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
    return { ...structuredClone(DEFAULT_SETTINGS), ...JSON.parse(raw) }
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

// A fresh progress object covers every vocab word with an empty FSRS card,
// keyed by hanzi + pinyin so homographs (same character, different reading)
// are tracked as the separate words they are.
function freshProgress(vocab) {
  const cards = {}
  for (const v of vocab) cards[cardKey(v)] = newCardState(v)
  return { version: 2, cards, log: [], updatedAt: new Date().toISOString() }
}

// Merge stored progress with the current vocab list so newly added words get
// card states without wiping existing review history, and re-key any legacy
// records onto the composite hanzi+pinyin key.
//
// Never drop a card we can't map yet: vocab packs load AFTER the first
// reconcile, so a record whose word isn't loaded right now is preserved under
// its original key and re-mapped on a later pass once the pack arrives.
// Dropping it would truncate progress.json.
function reconcile(progress, vocab) {
  const p = progress || freshProgress(vocab)
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

  // Ensure every current vocab word has a card under its composite key.
  for (const v of vocab) {
    const k = cardKey(v)
    if (!p.cards[k]) p.cards[k] = newCardState(v)
  }

  if (!p.log) p.log = []
  return p
}

export function useProgress(vocab = SEED_VOCAB) {
  const [settings, setSettings] = useState(loadSettings)
  const [progress, setProgress] = useState(() => reconcile(loadLocalProgress(), vocab))
  const [syncState, setSyncState] = useState({ status: 'idle', message: '' })
  const shaRef = useRef(null)
  const saveTimer = useRef(null)

  // When the vocab list grows (packs loaded), add cards for any new words.
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

  const githubReady =
    settings.github.token && settings.github.owner && settings.github.repo

  // Pull latest from GitHub.
  const pull = useCallback(async () => {
    if (!githubReady) return
    setSyncState({ status: 'syncing', message: 'Loading from GitHub…' })
    try {
      const { data, sha } = await fetchProgress(settings.github)
      shaRef.current = sha
      if (data) {
        setProgress(reconcile(data, vocab))
        setSyncState({ status: 'ok', message: 'Synced' })
      } else {
        setSyncState({ status: 'ok', message: 'No remote file yet — will create on first save' })
      }
    } catch (e) {
      setSyncState({ status: 'error', message: e.message })
    }
  }, [githubReady, settings.github, vocab])

  // Push current progress to GitHub (debounced by caller via scheduleSync).
  const push = useCallback(
    async (data) => {
      if (!githubReady) return
      setSyncState({ status: 'syncing', message: 'Saving…' })
      try {
        const payload = { ...data, updatedAt: new Date().toISOString() }
        const { sha } = await saveProgress(settings.github, payload, shaRef.current)
        shaRef.current = sha
        setSyncState({ status: 'ok', message: 'Synced' })
      } catch (e) {
        setSyncState({ status: 'error', message: e.message })
      }
    },
    [githubReady, settings.github]
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
        const card = prev.cards[key]
        if (!card) return prev
        const updated = reviewCard(card, ratingKey)
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
              at: new Date().toISOString(),
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

  return {
    settings,
    updateSettings,
    progress,
    rate,
    syncState,
    pull,
    forcePush: () => push(progress),
    githubReady,
    isDue,
  }
}
