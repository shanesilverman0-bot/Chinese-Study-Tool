import React, { useEffect, useMemo, useState } from 'react'
import { SEED_VOCAB } from './data/vocab.js'
import { loadVocab } from './lib/vocab.js'
import { useProgress } from './hooks/useProgress.js'
import { useStudyFilter } from './hooks/useStudyFilter.js'
import { primeVoices } from './lib/speech.js'
import { isDue, cardKey } from './lib/fsrs.js'
import { filterVocab } from './lib/vocab.js'
import DangdaiFilter from './components/DangdaiFilter.jsx'
import Dashboard from './components/Dashboard.jsx'
import Flashcard from './components/Flashcard.jsx'
import Settings from './components/Settings.jsx'
import RepoFiles from './components/RepoFiles.jsx'

export default function App() {
  // Vocab starts as the bundled seed, then grows when packs load from the repo.
  const [vocab, setVocab] = useState(SEED_VOCAB)
  const [vocabInfo, setVocabInfo] = useState({ packs: [], errors: [] })

  const {
    settings,
    updateSettings,
    progress,
    rate,
    syncState,
    pull,
    forcePush,
    githubReady,
  } = useProgress(vocab)

  const {
    filter,
    toggleTocflBand,
    toggleCcccList,
    getFilteredVocab,
    resetFilter,
  } = useStudyFilter(vocab)

  const [dangdaiFilter, setDangdaiFilter] = useState({ book: null, lesson: null, part: null })

  const [view, setView] = useState('home') // home | review | settings | files
  const [queue, setQueue] = useState([]) // holds composite card keys
  const [pos, setPos] = useState(0)

  // Look up the word behind a card key. Keyed by hanzi+pinyin so homographs
  // resolve to the correct word.
  const vocabByKey = useMemo(
    () => Object.fromEntries(vocab.map((v) => [cardKey(v), v])),
    [vocab]
  )

  const tutorConfig = useMemo(
    () => ({
      provider: settings.aiProvider,
      claudeApiKey: settings.claudeApiKey,
      claudeModel: settings.claudeModel,
      deepseekApiKey: settings.deepseekApiKey,
      deepseekModel: settings.deepseekModel,
    }),
    [settings.aiProvider, settings.claudeApiKey, settings.claudeModel, settings.deepseekApiKey, settings.deepseekModel]
  )

  useEffect(() => {
    primeVoices()
  }, [])

  // Load vocab packs from the repo whenever GitHub credentials change.
  const { token, owner, repo, branch } = settings.github
  const reloadVocab = useMemo(
    () => async () => {
      if (!(token && owner && repo)) {
        setVocab(SEED_VOCAB)
        return
      }
      try {
        const res = await loadVocab(settings.github)
        setVocab(res.vocab)
        setVocabInfo({ packs: res.packs, errors: res.errors })
      } catch (e) {
        setVocabInfo({ packs: [], errors: [e.message] })
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, owner, repo, branch]
  )

  useEffect(() => {
    reloadVocab()
  }, [reloadVocab])

  // Build a review queue: due cards first, then unseen, from filtered vocab, capped.
  const buildQueue = () => {
  const filtered = filterVocab(getFilteredVocab(), dangdaiFilter)    
  const now = new Date()
    const due = []
    const unseen = []
    const rest = []
    for (const v of filtered) {
      const key = cardKey(v)
      const card = progress.cards[key]
      if (!card) continue
      if (isDue(card, now)) due.push(key)
      else if (card.reps === 0) unseen.push(key)
      else rest.push(key)
    }
    const primary = [...due, ...unseen].slice(0, 40)
    if (primary.length > 0) return primary
    return rest.slice(0, 20)
  }

  function startReview() {
    const q = buildQueue()
    setQueue(q)
    setPos(0)
    setView(q.length ? 'review' : 'home')
  }

  function handleRate(ratingKey) {
    const key = queue[pos]
    rate(key, ratingKey)
    if (pos + 1 < queue.length) setPos(pos + 1)
    else setView('home')
  }

  const currentWord = queue[pos] ? vocabByKey[queue[pos]] : null
  const currentCard = queue[pos] ? progress.cards[queue[pos]] : null

  return (
    <div className="ink-texture min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col">
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
            <NavBtn active={view === 'home'} onClick={() => setView('home')}>首頁</NavBtn>
            <NavBtn active={view === 'files'} onClick={() => setView('files')}>檔案</NavBtn>
            <NavBtn active={view === 'settings'} onClick={() => setView('settings')}>設定</NavBtn>
          </div>
        </header>

        <main className="flex-1 px-3 pb-6">
          <div className="min-h-full rounded-3xl paper-texture px-4 py-6 shadow-xl sm:px-6">
            {view === 'home' && (
              <Dashboard
                progress={progress}
                vocab={vocab}
                filter={filter}
                toggleTocflBand={toggleTocflBand}
                toggleCcccList={toggleCcccList}
                getFilteredVocab={getFilteredVocab}
                onStart={startReview}
              />
            )}

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
                  tutorConfig={tutorConfig}
                />
              </div>
            )}

            {view === 'files' && (
              <RepoFiles github={settings.github} onChanged={reloadVocab} />
            )}

            {view === 'settings' && (
              <Settings
                settings={settings}
                updateSettings={updateSettings}
                syncState={syncState}
                pull={pull}
                forcePush={forcePush}
                vocabInfo={vocabInfo}
                vocabCount={vocab.length}
                onReloadVocab={reloadVocab}
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
