// Central state hook: owns the deck (card states + review log + settings),
// persists settings to localStorage, and orchestrates GitHub load/save.

import { useCallback, useEffect, useRef, useState } from 'react'
import { SEED_VOCAB } from '../data/vocab.js'
import { newCardState, reviewCard, isDue } from '../lib/fsrs.js'
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

// A fresh progress object covers every vocab hanzi with an empty FSRS card.
function freshProgress(vocab) {
  const cards = {}
  for (const v of vocab) cards[v.hanzi] = newCardState(v.hanzi)
  return { version: 1, cards, log: [], updatedAt: new Date().toISOString() }
}

// Merge stored progress with the current vocab list so newly added words get
// card states without wiping existing review history. Also migrate old id-based
// progress to hanzi-based for backwards compatibility.
function reconcile(progress, vocab) {
  const p = progress || freshProgress(vocab)
  if (!p.cards) p.cards = {}

  // Migrate id-based cards to hanzi-based if needed (for backwards compat).
  // Never drop a card we can't map yet: vocab packs load AFTER the first
  // reconcile, so an old id-keyed record whose word isn't loaded right now
  // must be preserved under its original key and re-mapped on a later pass
  // once the pack arrives. Dropping it would truncate progress.json.
  const vocabById = Object.fromEntries(vocab.map((v) => [v.id, v]))
  const migratedCards = {}
  for (const [key, card] of Object.entries(p.cards)) {
    if (card.hanzi) {
      migratedCards[card.hanzi] = card
    } else if (vocabById[key]) {
      migratedCards[vocabById[key].hanzi] = { ...card, hanzi: vocabById[key].hanzi }
    } else {
      // Unmappable for now (pack not loaded) — keep it as-is.
      migratedCards[key] = card
    }
  }
  p.cards = migratedCards

  // Ensure all vocab has a card
  for (const v of vocab) {
    if (!p.cards[v.hanzi]) p.cards[v.hanzi] = newCardState(v.hanzi)
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
  // Can accept either hanzi (string) or a vocab entry object with id/hanzi.
  const rate = useCallback(
    (cardKey, ratingKey) => {
      let hanzi = cardKey
      if (typeof cardKey === 'object' && cardKey.hanzi) {
        hanzi = cardKey.hanzi
      }
      setProgress((prev) => {
        const card = prev.cards[hanzi]
        if (!card) return prev
        const updated = reviewCard(card, ratingKey)
        const next = {
          ...prev,
          cards: { ...prev.cards, [hanzi]: updated },
          log: [
            ...prev.log,
            { hanzi, rating: ratingKey, at: new Date().toISOString() },
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
