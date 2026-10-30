import React, { useEffect, useMemo, useRef, useState } from 'react'
import { SEED_VOCAB } from './data/vocab.js'
import { CCC_VOCAB, CCC_PACK_NAMES } from './data/ccc.js'
import { loadVocabPacksFromGitHub, filterVocab } from './lib/vocab.js'
import { useProgress } from './hooks/useProgress.js'
import { useStudyFilter } from './hooks/useStudyFilter.js'
import { primeVoices } from './lib/speech.js'
import { isDue, cardKey, newCardState } from './lib/fsrs.js'
import { migrate } from './lib/migrate.js'
import { mergeProgress } from './lib/merge.js'
import { itemTypeOf, buildItemIndex } from './lib/items.js'
import Dashboard from './components/Dashboard.jsx'
import Flashcard from './components/Flashcard.jsx'
import Settings from './components/Settings.jsx'
import RepoFiles from './components/RepoFiles.jsx'
import DataBanner from './components/DataBanner.jsx'
import { DATA_MODE, assertWriteAllowed, dataPath } from './lib/dataMode.js'

export default function App() {
  // Vocab starts as the bundled seed, then grows when packs load from the repo.
  const [vocab, setVocab] = useState(() => [...SEED_VOCAB, ...CCC_VOCAB])
  const [vocabInfo, setVocabInfo] = useState({ packs: [], errors: [] })

  const {
    settings,
    updateSettings,
    progress,
    rate,
    syncState,
    pull,
    forcePush,
    saveNow,
    githubReady,
    replaceProgress,
    gh,
  } = useProgress(vocab)

  // Debug handle (dev and local modes only, DESIGN §3.4). The ref keeps the
  // getter current without re-creating the handle.
  const progressRef = useRef(progress)
  progressRef.current = progress
  const itemIndex = useMemo(
    () => buildItemIndex({ tocfl: SEED_VOCAB, ccc: CCC_VOCAB, customItems: progress.customItems }),
    [progress.customItems]
  )
  const itemIndexRef = useRef(itemIndex)
  itemIndexRef.current = itemIndex
  useEffect(() => {
    if (DATA_MODE === 'live') return
    window.__tt = {
      dataMode: DATA_MODE,
      assertWriteAllowed,
      dataPath,
      migrate,
      mergeProgress,
      itemTypeOf,
      get items() {
        return itemIndexRef.current
      },
      get progress() {
        return progressRef.current
      },
    }
  }, [])

  const {
    filter,
    toggleTocflBand,
  } = useStudyFilter(vocab)

  const [dangdaiFilter, setDangdaiFilter] = useState({ book: null, chapter: null, list: null })

  const filteredVocab = useMemo(() => {
    const tocflVocab = vocab.filter(
      (v) => v.source === 'tocfl' && filter.tocfl[v.band] === true
    )
    const ccccVocab = dangdaiFilter.book != null
      ? filterVocab(vocab.filter((v) => v.source === 'cccc'), dangdaiFilter)
      : []
    // Deduplicate by composite key — a word may exist as both a tocfl and a
    // cccc entry when it appears in both SEED_VOCAB and a dangdai pack.
    // Without this, the same card key ends up in the review queue twice.
    const seenKeys = new Set()
    return [...tocflVocab, ...ccccVocab].filter((v) => {
      const k = cardKey(v)
      if (seenKeys.has(k)) return false
      seenKeys.add(k)
      return true
    })
  }, [vocab, filter.tocfl, dangdaiFilter])

  const [view, setView] = useState('home') // home | review | settings | files
  const [queue, setQueue] = useState([]) // holds composite card keys
  const [pos, setPos] = useState(0)

  // Look up the word behind a card key. Keyed by hanzi+pinyin so homographs
  // resolve to the correct word.
  // Built from CCC rows first, then TOCFL, so the TOCFL entry (its own sense
  // gloss, level, POS) wins over a CCC row with the same key.
  const vocabByKey = useMemo(
    () => Object.fromEntries(
      [...vocab.filter((v) => v.source !== 'tocfl'), ...vocab.filter((v) => v.source === 'tocfl')]
        .map((v) => [cardKey(v), v])
    ),
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
  const { token, owner, repo, branch } = gh
  const reloadVocab = useMemo(
    () => async () => {
      if (!(token && owner && repo)) {
        setVocab([...SEED_VOCAB, ...CCC_VOCAB])
        return
      }
      try {
        const res = await loadVocabPacksFromGitHub(gh, { skipNames: CCC_PACK_NAMES })
        setVocab([...SEED_VOCAB, ...CCC_VOCAB, ...res.vocab])
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
    const now = new Date()
    const due = []
    const unseen = []
    const rest = []
    const queued = new Set()
    for (const v of filteredVocab) {
      const key = itemIndex.studyKeyOf(cardKey(v), progress.cards)
      if (queued.has(key)) continue // two list entries resolved to the same card
      queued.add(key)
      const card = progress.cards[key]
      if (!card || card.reps === 0) unseen.push(key) // no card = new
      else if (isDue(card, now)) due.push(key)
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
    // An existing card (possibly under an older CCC key) is rated by its key;
    // a new word passes its vocab entry so the card gets the right key and fields.
    rate(progress.cards[key] ? key : (vocabByKey[key] ?? key), ratingKey)
    if (pos + 1 < queue.length) setPos(pos + 1)
    else setView('home')
  }

  const currentWord = queue[pos]
    ? vocabByKey[queue[pos]] ?? vocabByKey[itemIndex.get(queue[pos])?.rawAliasOf] ?? null
    : null
  const currentCard = queue[pos]
    ? progress.cards[queue[pos]] ?? (currentWord ? newCardState(currentWord) : null)
    : null

  return (
    <div className="ink-texture min-h-screen">
      <DataBanner gh={gh} />
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
                filteredVocab={filteredVocab}
                dangdaiFilter={dangdaiFilter}
                setDangdaiFilter={setDangdaiFilter}
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
                  onPrev={pos > 0 ? () => setPos(pos - 1) : undefined}
                  onNext={pos + 1 < queue.length ? () => setPos(pos + 1) : undefined}
                  tutorConfig={tutorConfig}
                />
              </div>
            )}

            {view === 'files' && (
              <RepoFiles github={gh} onChanged={reloadVocab} />
            )}

            {view === 'settings' && (
              <Settings
                settings={settings}
                updateSettings={updateSettings}
                syncState={syncState}
                pull={pull}
                forcePush={forcePush}
                saveNow={saveNow}
                progress={progress}
                replaceProgress={replaceProgress}
                effectiveGh={gh}
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
