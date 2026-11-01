import React, { useEffect, useMemo, useRef, useState } from 'react'
import { SEED_VOCAB } from './data/vocab.js'
import { CCC_VOCAB, CCC_PACK_NAMES } from './data/ccc.js'
import { loadVocabPacksFromGitHub } from './lib/vocab.js'
import { useProgress, clearLogArchiveStamp } from './hooks/useProgress.js'
import { useCounts } from './hooks/useCounts.js'
import { recomputeHistory } from './lib/counts.js'
import { primeVoices } from './lib/speech.js'
import { cardKey, newCardState } from './lib/fsrs.js'
import { getAllLists } from './lib/lists.js'
import { requeueAfterRating } from './lib/queue.js'
import { loadSelection, saveSelection } from './lib/selection.js'
import { migrate } from './lib/migrate.js'
import { mergeProgress } from './lib/merge.js'
import { itemTypeOf, buildItemIndex } from './lib/items.js'
import Dashboard from './components/Dashboard.jsx'
import ListsView from './components/ListsView.jsx'
import Flashcard from './components/Flashcard.jsx'
import Settings from './components/Settings.jsx'
import RepoFiles from './components/RepoFiles.jsx'
import SessionTimer from './components/SessionTimer.jsx'
import ManualEntryForm from './components/ManualEntryForm.jsx'
import DataBanner from './components/DataBanner.jsx'
import ExercisePlayer from './components/ExercisePlayer.jsx'
import { loadExerciseFile } from './lib/exerciseStore.js'
import { variantFiles } from './lib/lists.js'
import { questionRefs, contextStats, pickPracticeQuestions } from './lib/context.js'
import { newId } from './lib/ids.js'
import { DATA_MODE, assertWriteAllowed, dataPath } from './lib/dataMode.js'
import { WideContext, useWideLayout } from './lib/layout.js'

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
    updateProgress,
    updateStudySettings,
    addSession,
    addAttempt,
    startTestRun,
    finishTestRun,
    abandonTestRun,
    upsertManualEntry,
    upsertList,
    deleteList,
    dataReady,
    isBlocked,
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
  const { counts, today, baseline, snapshotNow, gaps } = useCounts({ progress, itemIndex, dataReady, isBlocked, updateProgress })
  const updateStudySettingsRef = useRef(updateStudySettings)
  updateStudySettingsRef.current = updateStudySettings
  const countsRef = useRef(counts)
  countsRef.current = counts
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
      get counts() {
        return countsRef.current
      },
      get progress() {
        return progressRef.current
      },
      // Phase 6 check: archive entries older than n days on the next save.
      setLogKeepDays(n) {
        clearLogArchiveStamp()
        updateStudySettingsRef.current({ logKeepDays: n })
      },
    }
  }, [])

  const updateGoals = (fn) => updateProgress((prev) => ({ ...prev, goals: fn(prev.goals ?? []) }))

  const recompute = () => {
    let changed = 0
    updateProgress((prev) => {
      const r = recomputeHistory({ progress: prev, index: itemIndex, settings: prev.studySettings, baseline })
      changed = r.changed
      return r.progress
    })
    return changed
  }

  const allLists = useMemo(() => getAllLists(progress, CCC_VOCAB), [progress.lists]) // eslint-disable-line react-hooks/exhaustive-deps
  const [selection, setSelection] = useState(() =>
    loadSelection(allLists.filter((l) => l.sourceType === 'ccc' && l.source.part == null).map((l) => l.source))
  )
  useEffect(() => { saveSelection(selection) }, [selection])

  const [manualOpen, setManualOpen] = useState(false)
  const [view, setView] = useState('home') // home | lists | review | settings | files
  const layout = useWideLayout()
  const [queue, setQueue] = useState([]) // holds composite card keys
  const [pos, setPos] = useState(0)
  const [stillLearning, setStillLearning] = useState(null) // keys, at the end of the queue
  const [practice, setPractice] = useState(null) // { refs, listIds } for the exercise player
  const [test, setTest] = useState(null) // { runId, variant, listId, refs } for a list test
  const [pickerTab, setPickerTab] = useState('flash')

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

  function startReview(q) {
    setQueue(q)
    setPos(0)
    setStillLearning(null)
    setView(q.length ? 'review' : 'home')
  }

  const loadFile = useMemo(
    () => (fileId) => {
      const meta = progressRef.current.exerciseFiles?.[fileId]
      return meta ? loadExerciseFile(gh, meta) : Promise.resolve(null)
    },
    [gh]
  )

  function startPractice(p) {
    setPractice(p)
    setView(p.refs.length ? 'practice' : 'home')
  }

  // DESIGN §11.3: all enabled questions of one variant across the list's batches, in file order.
  async function takeTest(listId, variant) {
    const metas = variantFiles(listId, variant, progressRef.current.exerciseFiles)
    const loaded = await Promise.all(metas.map(async (meta) => ({ meta, json: await loadFile(meta.id) })))
    const refs = questionRefs(loaded.filter((f) => f.json), progressRef.current.exerciseFlags)
    if (!refs.length) { window.alert('No questions could be loaded for this test.'); return }
    const now = new Date().toISOString()
    const runId = newId('t')
    startTestRun({
      id: runId, listId, variant, fileIds: metas.map((m) => m.id), questionCount: refs.length,
      startedAt: now, finishedAt: null, correct: 0, total: 0, status: 'in-progress', updatedAt: now,
    })
    setTest({ runId, variant, listId, refs })
    setView('test')
  }

  // DESIGN §11.6: practice over questions whose target is in the gap list. Reports gap words with no exercises.
  async function practiceGaps() {
    const gapKeys = gaps.map((g) => g.key)
    const gapSet = new Set(gapKeys)
    const metas = Object.values(progressRef.current.exerciseFiles ?? {}).filter((m) => m && !m.deleted)
    const loaded = await Promise.all(metas.map(async (meta) => ({ meta, json: await loadFile(meta.id) })))
    const all = questionRefs(loaded.filter((f) => f.json), progressRef.current.exerciseFlags).filter((r) => gapSet.has(r.key))
    if (!all.length) { window.alert('None of the gap words have exercises yet.'); return }
    const picked = pickPracticeQuestions({ refs: all, progress: progressRef.current, types: null, count: 20, gapKeys })
    startPractice({ refs: picked, listIds: [...new Set(picked.map((r) => progressRef.current.exerciseFiles?.[r.fileId]?.listId).filter(Boolean))] })
  }

  function practiceList(id) {
    setSelection((sel) => ({ ...sel, listIds: [id], tocflLevels: [] }))
    setPickerTab('mixed')
    setView('home')
    setTimeout(() => document.getElementById('study-picker')?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  function studyList(id) {
    setSelection((sel) => ({ ...sel, listIds: [id], tocflLevels: [] }))
    setView('home')
    setTimeout(() => document.getElementById('study-picker')?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  const wordFor = (key) =>
    vocabByKey[key] ?? vocabByKey[itemIndex.get(key)?.rawAliasOf] ?? itemIndex.get(key) ?? null

  function handleRate(ratingKey) {
    const key = queue[pos]
    // An existing card (possibly under an older CCC key) is rated by its key;
    // a new word passes its entry so the card gets the right key and fields.
    const updated = rate(progress.cards[key] ? key : (wordFor(key) ?? key), ratingKey, selection.listIds)
    const now = new Date()
    const next = updated ? requeueAfterRating(queue, pos, key, updated, now) : queue
    if (next !== queue) setQueue(next)
    if (pos + 1 < next.length) { setPos(pos + 1); return }
    // End of the queue: offer any cards still in Learning/Relearning.
    const cards = { ...progress.cards, [key]: updated ?? progress.cards[key] }
    const waiting = [...new Set(next)].filter((k) => {
      const c = cards[k]
      return c && (c.state === 1 || c.state === 3) && new Date(c.due).getTime() - now.getTime() <= 60 * 60 * 1000
    })
    if (waiting.length) setStillLearning(waiting)
    else setView('home')
  }

  function continueLearning() {
    const keys = stillLearning
    setQueue([...queue, ...keys])
    setPos(pos + 1)
    setStillLearning(null)
  }

  const currentWord = queue[pos] ? wordFor(queue[pos]) : null
  const currentCard = queue[pos]
    ? progress.cards[queue[pos]] ?? (currentWord ? newCardState(currentWord) : null)
    : null

  return (
    <WideContext.Provider value={layout.wide}>
    <div className="ink-texture min-h-screen">
      <DataBanner gh={gh} />
      <div className={`mx-auto flex min-h-screen flex-col ${layout.wide ? 'max-w-6xl' : 'max-w-lg'}`}>
        <header className="flex items-center justify-between gap-2 px-3 pb-3 pt-6 sm:px-5">
          <button onClick={() => setView('home')} className="flex items-center gap-2.5 text-left">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cinnabar font-display text-lg font-bold text-paper">
              習
            </span>
            <div className="hidden min-[400px]:block">
              <div className="font-display text-base font-bold leading-none text-paper">習字</div>
              <div className="whitespace-nowrap font-mono text-[10px] uppercase tracking-widest text-paper/40">
                TOCFL Tutor
              </div>
            </div>
          </button>

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <SyncDot syncState={syncState} githubReady={githubReady} />
            <SessionTimer addSession={addSession} snapshotNow={snapshotNow} />
            <NavBtn active={view === 'home'} onClick={() => setView('home')}>首頁</NavBtn>
            <NavBtn active={view === 'lists'} onClick={() => setView('lists')}>清單</NavBtn>
            <NavBtn active={view === 'files'} onClick={() => setView('files')}>檔案</NavBtn>
            <NavBtn active={view === 'settings'} onClick={() => setView('settings')}>設定</NavBtn>
            {layout.desktop && (
              <button
                onClick={layout.toggle}
                title={layout.wide ? 'Narrow (phone) layout' : 'Wide (desktop) layout'}
                className="ml-1 rounded-full px-2 py-1.5 font-mono text-sm text-paper/60 hover:text-paper"
              >
                {layout.wide ? '⇥⇤' : '⇤⇥'}
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 px-3 pb-6">
          <div className="min-h-full rounded-3xl paper-texture px-4 py-6 shadow-xl sm:px-6">
            {view === 'home' && (
              <Dashboard
                progress={progress}
                counts={counts}
                gaps={gaps}
                itemIndex={itemIndex}
                onPracticeGaps={practiceGaps}
                baseline={baseline}
                todayDate={today.date}
                updateGoals={updateGoals}
                updateStudySettings={updateStudySettings}
                vocab={vocab}
                pickerProps={{
                  selection, setSelection, lists: allLists, index: itemIndex, progress, baseline, onStart: startReview,
                  onStartPractice: startPractice, loadFile, gapKeys: gaps.map((g) => g.key), tab: pickerTab, setTab: setPickerTab,
                }}
                onAddManual={() => setManualOpen(true)}
              />
            )}

            {view === 'lists' && (
              <ListsView
                lists={allLists}
                index={itemIndex}
                progress={progress}
                baseline={baseline}
                vocab={vocab}
                upsertList={upsertList}
                deleteList={deleteList}
                updateProgress={updateProgress}
                deviceSettings={settings}
                onStudyList={studyList}
                onPractice={practiceList}
                onTakeTest={takeTest}
              />
            )}

            {view === 'review' && stillLearning && (
              <div className="py-10 text-center">
                <p className="font-display text-lg text-ink">{stillLearning.length} cards still learning</p>
                <div className="mt-6 flex justify-center gap-3">
                  <button onClick={continueLearning} className="rounded-xl bg-cinnabar px-6 py-3 font-display font-bold text-paper">Continue</button>
                  <button onClick={() => { setStillLearning(null); setView('home') }} className="rounded-xl border border-ink/20 px-6 py-3 font-display text-ink/70">Finish</button>
                </div>
              </div>
            )}

            {view === 'review' && !stillLearning && currentWord && (
              <div className="mx-auto max-w-lg">
                <div className="mb-4 flex items-center justify-between">
                  <button
                    onClick={() => setView('home')}
                    className="font-mono text-xs text-ink/50 hover:text-ink"
                  >
                    ← 結束
                  </button>
                  <span className="font-mono text-xs text-ink/45">
                    {(pos + 1).toLocaleString('en-US')} / {queue.length.toLocaleString('en-US')}
                  </span>
                </div>
                <Flashcard
                  word={currentWord}
                  cardState={currentCard}
                  onRate={handleRate}
                  onPrev={pos > 0 ? () => setPos(pos - 1) : undefined}
                  onNext={pos + 1 < queue.length ? () => setPos(pos + 1) : undefined}
                  tutorConfig={tutorConfig}
                  understanding={queue[pos] ? contextStats(queue[pos], progress, progress.studySettings) : null}
                />
              </div>
            )}

            {view === 'practice' && practice && (
              <ExercisePlayer
                refs={practice.refs}
                loadFile={loadFile}
                mode="practice"
                index={itemIndex}
                onAttempt={(a) => addAttempt(a, [progress.exerciseFiles?.[a.fileId]?.listId].filter(Boolean))}
                onFinish={() => { setPractice(null); setView('home') }}
                onExit={() => { setPractice(null); setView('home') }}
              />
            )}

            {view === 'test' && test && (
              <ExercisePlayer
                key={test.runId}
                refs={test.refs}
                loadFile={loadFile}
                mode="test"
                runId={test.runId}
                variant={test.variant}
                index={itemIndex}
                onAttempt={(a) => addAttempt(a, [test.listId])}
                onComplete={(r) => finishTestRun(test.runId, r)}
                onFinish={() => { setTest(null); setView('lists') }}
                onExit={(r) => {
                  if (!r?.finished) abandonTestRun(test.runId, r)
                  setTest(null)
                  setView('lists')
                }}
              />
            )}

            {view === 'files' && (
              <div className="mx-auto max-w-3xl"><RepoFiles github={gh} onChanged={reloadVocab} /></div>
            )}

            {view === 'settings' && (
              <div className="mx-auto max-w-3xl">
              <Settings
                settings={settings}
                updateSettings={updateSettings}
                syncState={syncState}
                pull={pull}
                forcePush={forcePush}
                saveNow={saveNow}
                progress={progress}
                baseline={baseline}
                updateStudySettings={updateStudySettings}
                updateProgress={updateProgress}
                itemIndex={itemIndex}
                onRecompute={recompute}
                replaceProgress={replaceProgress}
                effectiveGh={gh}
                vocabInfo={vocabInfo}
                vocabCount={vocab.length}
                onReloadVocab={reloadVocab}
              />
              </div>
            )}
          </div>
        </main>
      </div>
      {manualOpen && (
        <ManualEntryForm
          entries={progress.manualEntries ?? []}
          tz={progress.studySettings?.timeZone}
          upsertManualEntry={upsertManualEntry}
          onClose={() => setManualOpen(false)}
        />
      )}
    </div>
    </WideContext.Provider>
  )
}

function NavBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-2 py-1.5 font-sans text-sm transition sm:px-3 ${
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
