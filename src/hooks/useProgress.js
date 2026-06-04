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
  claudeApiKey: '',
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

// A fresh progress object covers every vocab id with an empty FSRS card.
function freshProgress() {
  const cards = {}
  for (const v of SEED_VOCAB) cards[v.id] = newCardState(v.id)
  return { version: 1, cards, log: [], updatedAt: new Date().toISOString() }
}

// Merge stored progress with the current vocab list so newly added words get
// card states without wiping existing review history.
function reconcile(progress) {
  const p = progress || freshProgress()
  if (!p.cards) p.cards = {}
  for (const v of SEED_VOCAB) {
    if (!p.cards[v.id]) p.cards[v.id] = newCardState(v.id)
  }
  if (!p.log) p.log = []
  return p
}

export function useProgress() {
  const [settings, setSettings] = useState(loadSettings)
  const [progress, setProgress] = useState(() => reconcile(loadLocalProgress()))
  const [syncState, setSyncState] = useState({ status: 'idle', message: '' })
  const shaRef = useRef(null)
  const saveTimer = useRef(null)

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
        setProgress(reconcile(data))
        setSyncState({ status: 'ok', message: 'Synced' })
      } else {
        setSyncState({ status: 'ok', message: 'No remote file yet — will create on first save' })
      }
    } catch (e) {
      setSyncState({ status: 'error', message: e.message })
    }
  }, [githubReady, settings.github])

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
  const rate = useCallback(
    (vocabId, ratingKey) => {
      setProgress((prev) => {
        const card = prev.cards[vocabId]
        const updated = reviewCard(card, ratingKey)
        const next = {
          ...prev,
          cards: { ...prev.cards, [vocabId]: updated },
          log: [
            ...prev.log,
            { vocabId, rating: ratingKey, at: new Date().toISOString() },
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
