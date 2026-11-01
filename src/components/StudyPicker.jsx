import React, { useEffect, useMemo, useState } from 'react'
import { LEVELS } from '../data/vocab.js'
import { buildFlashcardQueue } from '../lib/queue.js'
import { questionRefs, pickPracticeQuestions } from '../lib/context.js'
import { listVoices, ttsSupported } from '../lib/speech.js'

const PRACTICE_SIZES = [10, 20, 50]
const TABS = [
  ['flash', '閃卡 Flashcards', null],
  ['cloze', 'Cloze', ['cloze']],
  ['fill', 'Fill', ['fill']],
  ['usage', 'Usage', ['usage']],
  ['listening', 'Listening', ['listening']],
  ['mixed', 'Mixed', null],
]

const SIZES = [20, 50, 100]
const fmt = (n) => n.toLocaleString('en-US')

// Study picker (DESIGN §9.3–9.4): TOCFL levels, CCC books/chapters/parts, Pleco and
// custom lists, the baseline switch, session size, and the exact queue length.
export default function StudyPicker({ selection, setSelection, lists, index, progress, baseline, onStart, onStartPractice, loadFile, gapKeys, tab: tabProp, setTab: setTabProp }) {
  const [tabLocal, setTabLocal] = useState('flash')
  const tab = tabProp ?? tabLocal
  const setTab = setTabProp ?? setTabLocal
  const [pCount, setPCount] = useState(20)
  const [loaded, setLoaded] = useState({}) // fileId -> parsed file | null
  const [hasVoice, setHasVoice] = useState(() => ttsSupported() && listVoices().length > 0)
  const [openBooks, setOpenBooks] = useState({})
  const [openChapters, setOpenChapters] = useState({})
  const sel = selection

  useEffect(() => {
    const f = () => setHasVoice(ttsSupported() && listVoices().length > 0)
    window.addEventListener('tts-voices-changed', f)
    return () => window.removeEventListener('tts-voices-changed', f)
  }, [])

  // Exercise files of the selected lists (loaded lazily, cached in `loaded`).
  const metas = useMemo(
    () => Object.values(progress.exerciseFiles ?? {}).filter((m) => m && !m.deleted && selection.listIds.includes(m.listId)),
    [progress.exerciseFiles, selection.listIds]
  )
  useEffect(() => {
    if (!loadFile) return
    let alive = true
    for (const m of metas) {
      if (m.id in loaded) continue
      loadFile(m.id).then((j) => { if (alive) setLoaded((p) => (m.id in p ? p : { ...p, [m.id]: j })) })
    }
    return () => { alive = false }
  }, [metas]) // eslint-disable-line react-hooks/exhaustive-deps
  const failedFiles = metas.filter((m) => m.id in loaded && !loaded[m.id]).length
  const refs = useMemo(
    () => questionRefs(metas.filter((m) => loaded[m.id]).map((m) => ({ meta: m, json: loaded[m.id] })), progress.exerciseFlags),
    [metas, loaded, progress.exerciseFlags]
  )
  const typeCount = useMemo(() => {
    const c = {}
    for (const r of refs) c[r.type] = (c[r.type] ?? 0) + 1
    return c
  }, [refs])
  const tabTypes = (id) => {
    const t = TABS.find((x) => x[0] === id)
    return t[2] ?? ['cloze', 'fill', 'usage', ...(hasVoice ? ['listening'] : [])]
  }
  const tabCount = (id) => tabTypes(id).reduce((n, t) => n + (typeCount[t] ?? 0), 0)
  const tabDisabled = (id) => (id === 'listening' && !hasVoice) || (id !== 'flash' && tabCount(id) === 0)
  const practiceMode = tab !== 'flash'

  const startPractice = () => {
    const picked = pickPracticeQuestions({ refs, progress, types: tabTypes(tab), count: pCount, gapKeys })
    onStartPractice?.({ refs: picked, listIds: selection.listIds })
  }

  const run = (s) => buildFlashcardQueue({ selection: s, lists, index, progress, baseline })
  const patch = (p) => setSelection({ ...sel, ...p })

  // Per-row due·new, ignoring size limits but honoring the baseline switch.
  const countsFor = useMemo(() => {
    const cache = new Map()
    return (listIds, tocflLevels) => {
      const k = JSON.stringify([listIds, tocflLevels])
      if (!cache.has(k)) {
        const { stats } = buildFlashcardQueue({
          selection: { listIds, tocflLevels, includeBaseline: sel.includeBaseline, size: null, newMax: null },
          lists, index, progress, baseline,
        })
        cache.set(k, stats)
      }
      return cache.get(k)
    }
  }, [lists, index, progress.cards, baseline, sel.includeBaseline]) // eslint-disable-line react-hooks/exhaustive-deps

  const { queue, stats } = useMemo(
    () => run(sel),
    [sel, lists, index, progress.cards, baseline] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const books = useMemo(() => {
    const m = new Map()
    for (const l of lists) {
      if (l.sourceType !== 'ccc') continue
      const { book, chapter, part } = l.source
      if (!m.has(book)) m.set(book, new Map())
      const chs = m.get(book)
      if (!chs.has(chapter)) chs.set(chapter, { chapter, id: null, parts: [] })
      if (part == null) chs.get(chapter).id = l.id
      else chs.get(chapter).parts.push({ part, id: l.id })
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([book, chs]) => ({
      book, chapters: [...chs.values()].sort((a, b) => a.chapter - b.chapter),
    }))
  }, [lists])

  const toggleIds = (ids, on) => {
    const set = new Set(sel.listIds)
    for (const id of ids) on ? set.add(id) : set.delete(id)
    patch({ listIds: [...set] })
  }
  const has = (id) => sel.listIds.includes(id)
  const toggleLevel = (l) =>
    patch({ tocflLevels: sel.tocflLevels.includes(l) ? sel.tocflLevels.filter((x) => x !== l) : [...sel.tocflLevels, l] })

  const stored = (type) => lists.filter((l) => l.sourceType === type)
  const nothing = sel.listIds.length === 0 && sel.tocflLevels.length === 0
  const canStart = !nothing && queue.length > 0

  const Counts = ({ s }) => (
    <span className="font-mono text-[11px] text-ink/45">
      <span className={s.due ? 'text-cinnabar' : ''}>{fmt(s.due)}</span>·{fmt(s.freshAvailable)}
    </span>
  )

  const Row = ({ id, label, indent = 0 }) => {
    const l = lists.find((x) => x.id === id)
    return (
      <label className="flex min-h-[36px] flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 hover:bg-ink/5" style={{ paddingLeft: indent }}>
        <input type="checkbox" className="h-4 w-4" checked={has(id)} onChange={(e) => toggleIds([id], e.target.checked)} />
        <span className="flex-1 font-sans text-sm text-ink/80">{label}</span>
        {l && <Counts s={countsFor([id], [])} />}
      </label>
    )
  }

  const chip = (on) =>
    `rounded-full border px-3 py-1.5 font-sans text-sm transition ${on ? 'border-cinnabar bg-cinnabar/10 text-ink' : 'border-ink/15 text-ink/60 hover:text-ink'}`

  return (
    <div className="rounded-2xl border border-ink/10 bg-white/50 p-5">
      <div className="mb-1 flex gap-1 overflow-x-auto border-b border-ink/10">
        {TABS.map(([id, label]) => (
          <button
            key={id} onClick={() => setTab(id)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 font-sans text-sm ${tab === id ? 'border-cinnabar font-semibold text-ink' : 'border-transparent text-ink/55'} ${tabDisabled(id) ? 'opacity-45' : ''}`}
          >{label}</button>
        ))}
      </div>
      {practiceMode && tabDisabled(tab) && (
        <p className="mb-2 mt-2 rounded-lg bg-ink/5 px-3 py-2 font-sans text-xs text-ink/65">
          {tab === 'listening' && !hasVoice
            ? 'No Chinese voice on this device'
            : 'No exercises yet — import in Lists → Exercises'}
        </p>
      )}
      <div className="mb-2" />

      <h4 className="mb-2 font-display text-xs font-bold tracking-wide text-ink/60">TOCFL 等級 · Levels</h4>
      <div className="mb-4 flex flex-wrap gap-2">
        {LEVELS.map((l) => {
          const s = countsFor([], [l])
          return (
            <button key={l} onClick={() => toggleLevel(l)} className={chip(sel.tocflLevels.includes(l))}>
              {l} <span className="font-mono text-[11px] text-ink/45">{fmt(s.due)}·{fmt(s.freshAvailable)}</span>
            </button>
          )
        })}
      </div>

      <h4 className="mb-1 font-display text-xs font-bold tracking-wide text-ink/60">當代中文 · Contemporary Chinese</h4>
      <div className="mb-4">
        {books.length === 0 && <p className="py-2 font-sans text-sm text-ink/50">No CCC lists.</p>}
        {books.map(({ book, chapters }) => {
          const chapterIds = chapters.map((c) => c.id).filter(Boolean)
          const all = chapterIds.length > 0 && chapterIds.every(has)
          const some = chapterIds.some(has)
          return (
            <div key={book}>
              <div className="flex items-center">
                <button className="w-7 py-2 text-xs text-ink/40" onClick={() => setOpenBooks((p) => ({ ...p, [book]: !p[book] }))}>
                  {openBooks[book] ? '▾' : '▸'}
                </button>
                <label className="flex min-h-[36px] flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 hover:bg-ink/5">
                  <input
                    type="checkbox" className="h-4 w-4" checked={all}
                    ref={(el) => { if (el) el.indeterminate = some && !all }}
                    onChange={(e) => toggleIds(chapterIds, e.target.checked)}
                  />
                  <span className="flex-1 font-sans text-sm font-medium text-ink">Book {book}</span>
                  <Counts s={countsFor(chapterIds, [])} />
                </label>
              </div>
              {openBooks[book] && chapters.map((c) => {
                const ck = `${book}-${c.chapter}`
                return (
                  <div key={c.chapter} className="ml-7">
                    <div className="flex items-center">
                      {c.id ? <Row id={c.id} label={`第${c.chapter}課`} /> : <span className="flex-1 px-2 font-sans text-sm text-ink/60">第{c.chapter}課</span>}
                      {c.parts.length > 0 && (
                        <button className="w-8 py-2 text-xs text-ink/40" onClick={() => setOpenChapters((p) => ({ ...p, [ck]: !p[ck] }))}>
                          {openChapters[ck] ? '▾' : '▸'}
                        </button>
                      )}
                    </div>
                    {openChapters[ck] && c.parts.map((p) => <Row key={p.id} id={p.id} label={`部分 ${p.part}`} indent={20} />)}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      <h4 className="mb-1 font-display text-xs font-bold tracking-wide text-ink/60">Pleco</h4>
      <div className="mb-4">
        {stored('pleco').length === 0
          ? <p className="py-1 font-sans text-sm text-ink/50">No Pleco lists yet. Import one under 清單 → 匯入 Pleco.</p>
          : stored('pleco').map((l) => <Row key={l.id} id={l.id} label={`${l.name} (${l.itemKeys.length})`} />)}
      </div>

      <h4 className="mb-1 font-display text-xs font-bold tracking-wide text-ink/60">自訂 · Custom</h4>
      <div className="mb-4">
        {stored('custom').length === 0
          ? <p className="py-1 font-sans text-sm text-ink/50">No custom lists. Create one in 清單.</p>
          : stored('custom').map((l) => <Row key={l.id} id={l.id} label={`${l.name} (${l.itemKeys.length})`} />)}
      </div>

      {practiceMode ? (
        <>
          <h4 className="mb-2 font-display text-xs font-bold tracking-wide text-ink/60">How many questions</h4>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {PRACTICE_SIZES.map((n) => <button key={n} onClick={() => setPCount(n)} className={chip(pCount === n)}>{n}</button>)}
            <button onClick={() => setPCount(null)} className={chip(pCount == null)}>All</button>
          </div>
          <p className="mb-3 font-mono text-xs text-ink/55">
            {fmt(tabCount(tab))} questions available{failedFiles ? ` · ${failedFiles} file${failedFiles > 1 ? 's' : ''} couldn't load` : ''}
          </p>
          <button
            disabled={tabDisabled(tab) || tabCount(tab) === 0}
            onClick={startPractice}
            className={`w-full rounded-xl py-3 font-display font-bold transition ${tabDisabled(tab) || tabCount(tab) === 0 ? 'cursor-not-allowed bg-ink/20 text-ink/60' : 'bg-cinnabar text-paper hover:bg-seal'}`}
          >
            {nothing ? 'Nothing selected' : `Start ${fmt(pCount == null ? tabCount(tab) : Math.min(pCount, tabCount(tab)))} questions`}
          </button>
        </>
      ) : (
      <>
      <label className="mb-4 flex cursor-pointer items-center justify-between rounded-xl border border-ink/10 px-4 py-3">
        <span className="font-sans text-sm text-ink/80">Include baseline words</span>
        <input type="checkbox" className="h-5 w-5" checked={sel.includeBaseline} onChange={(e) => patch({ includeBaseline: e.target.checked })} />
      </label>

      <h4 className="mb-2 font-display text-xs font-bold tracking-wide text-ink/60">How many cards</h4>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {SIZES.map((n) => <button key={n} onClick={() => patch({ size: n })} className={chip(sel.size === n)}>{n}</button>)}
        <button onClick={() => patch({ size: null })} className={chip(sel.size == null)}>All</button>
        <input
          type="number" inputMode="numeric" min="1" placeholder="#"
          value={sel.size != null && !SIZES.includes(sel.size) ? sel.size : ''}
          onChange={(e) => patch({ size: e.target.value === '' ? null : Math.max(1, Math.floor(Number(e.target.value))) })}
          className="w-20 rounded-lg border border-ink/15 bg-transparent px-2 py-1.5 font-mono text-sm"
        />
      </div>
      <h4 className="mb-2 font-display text-xs font-bold tracking-wide text-ink/60">New cards</h4>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => patch({ newMax: null })} className={chip(sel.newMax == null)}>All</button>
        <input
          type="number" inputMode="numeric" min="0" placeholder="#"
          value={sel.newMax ?? ''}
          onChange={(e) => patch({ newMax: e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value))) })}
          className="w-20 rounded-lg border border-ink/15 bg-transparent px-2 py-1.5 font-mono text-sm"
        />
      </div>

      <p className="mb-3 font-mono text-xs text-ink/55">
        {fmt(stats.due)} due · {fmt(stats.fresh)} new · {fmt(stats.baselineSkipped)} baseline skipped
      </p>
      <button
        disabled={!canStart}
        onClick={() => onStart(queue)}
        className={`w-full rounded-xl py-3 font-display font-bold transition ${canStart ? 'bg-cinnabar text-paper hover:bg-seal' : 'cursor-not-allowed bg-ink/20 text-ink/60'}`}
      >
        {nothing
          ? 'Nothing selected'
          : queue.length === 0
            ? `Nothing due${stats.freshAvailable ? ` — ${fmt(stats.freshAvailable)} new available` : ''}`
            : `Start ${fmt(queue.length)} cards`}
      </button>
      </>
      )}
    </div>
  )
}
