import React, { useEffect, useMemo, useState } from 'react'
import { SEED_VOCAB } from './data/vocab.js'
import { useProgress } from './hooks/useProgress.js'
import { primeVoices } from './lib/speech.js'
import { isDue } from './lib/fsrs.js'
import Dashboard from './components/Dashboard.jsx'
import Flashcard from './components/Flashcard.jsx'
import Settings from './components/Settings.jsx'

const VOCAB_BY_ID = Object.fromEntries(SEED_VOCAB.map((v) => [v.id, v]))

export default function App() {
  const {
    settings,
    updateSettings,
    progress,
    rate,
    syncState,
    pull,
    forcePush,
    githubReady,
  } = useProgress()

  const [view, setView] = useState('home') // home | review | settings
  const [queue, setQueue] = useState([])
  const [pos, setPos] = useState(0)

  useEffect(() => {
    primeVoices()
  }, [])

  // Build a review queue: due cards in enabled bands first, then unseen, then
  // the rest — capped so a session feels finite.
  const buildQueue = useMemo(
    () => () => {
      const enabled = new Set(settings.enabledBands)
      const inScope = SEED_VOCAB.filter((v) => enabled.has(v.band))
      const now = new Date()
      const due = []
      const unseen = []
      const rest = []
      for (const v of inScope) {
        const card = progress.cards[v.id]
        if (!card) continue
        if (isDue(card, now)) due.push(v.id)
        else if (card.reps === 0) unseen.push(v.id)
        else rest.push(v.id)
      }
      // Primary session: everything due plus new cards, capped at 40.
      const primary = [...due, ...unseen].slice(0, 40)
      if (primary.length > 0) return primary
      // Nothing due and nothing new — offer a short free-practice set.
      return rest.slice(0, 20)
    },
    [settings.enabledBands, progress.cards]
  )

  function startReview() {
    const q = buildQueue()
    setQueue(q)
    setPos(0)
    setView(q.length ? 'review' : 'home')
  }

  function handleRate(ratingKey) {
    const vocabId = queue[pos]
    rate(vocabId, ratingKey)
    if (pos + 1 < queue.length) {
      setPos(pos + 1)
    } else {
      setView('home')
    }
  }

  const currentWord = queue[pos] ? VOCAB_BY_ID[queue[pos]] : null
  const currentCard = queue[pos] ? progress.cards[queue[pos]] : null

  return (
    <div className="ink-texture min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-5 pb-3 pt-6">
          <button onClick={() => setView('home')} className="flex items-center gap-2.5 text-left">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cinnabar font-display text-lg font-bold text-paper">
              習
            </span>
            <div>
              <div className="font-display text-base font-bold leading-none text-paper">習字</div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-paper/40">
                TOCFL Tutor
              </div>
            </div>
          </button>

          <div className="flex items-center gap-1">
            <SyncDot syncState={syncState} githubReady={githubReady} />
            <NavBtn active={view === 'home'} onClick={() => setView('home')}>
              首頁
            </NavBtn>
            <NavBtn active={view === 'settings'} onClick={() => setView('settings')}>
              設定
            </NavBtn>
          </div>
        </header>

        {/* Body — rounded paper sheet */}
        <main className="flex-1 px-3 pb-6">
          <div className="min-h-full rounded-3xl paper-texture px-4 py-6 shadow-xl sm:px-6">
            {view === 'home' && <Dashboard progress={progress} onStart={startReview} />}

            {view === 'review' && currentWord && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <button
                    onClick={() => setView('home')}
                    className="font-mono text-xs text-ink/50 hover:text-ink"
                  >
                    ← 結束
                  </button>
                  <span className="font-mono text-xs text-ink/45">
                    {pos + 1} / {queue.length}
                  </span>
                </div>
                <Flashcard
                  word={currentWord}
                  cardState={currentCard}
                  onRate={handleRate}
                  apiKey={settings.claudeApiKey}
                />
              </div>
            )}

            {view === 'settings' && (
              <Settings
                settings={settings}
                updateSettings={updateSettings}
                syncState={syncState}
                pull={pull}
                forcePush={forcePush}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

function NavBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 font-sans text-sm transition ${
        active ? 'bg-paper text-ink' : 'text-paper/60 hover:text-paper'
      }`}
    >
      {children}
    </button>
  )
}

function SyncDot({ syncState, githubReady }) {
  if (!githubReady) return null
  const color =
    syncState.status === 'ok'
      ? '#5fa777'
      : syncState.status === 'error'
        ? '#c0392b'
        : syncState.status === 'syncing'
          ? '#b8860b'
          : '#888'
  return (
    <span
      title={syncState.message}
      className="mr-1 inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: color }}
    />
  )
}
