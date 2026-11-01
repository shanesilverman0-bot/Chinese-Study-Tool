import React, { useEffect, useMemo, useRef, useState } from 'react'
import { speakAsync } from '../lib/speech.js'
import { newId } from '../lib/ids.js'

// Renders a cloze passage / fill sentence; the active blank is highlighted, others show （n）.
function Passage({ text, active, filled }) {
  const parts = text.split(/\[\[(\d+)\]\]/)
  return (
    <p className="whitespace-pre-wrap break-words font-display text-lg leading-loose text-ink">
      {parts.map((p, i) => {
        if (i % 2 === 0) return <span key={i}>{p}</span>
        const n = Number(p)
        if (n !== active) return <span key={i} className="text-ink/45">（{n}）</span>
        return (
          <span key={i} className="mx-0.5 inline-block min-w-[3.5rem] border-b-2 border-cinnabar bg-cinnabar/10 px-1 text-center">
            {filled ?? n}
          </span>
        )
      })}
    </p>
  )
}

// DESIGN §11.1. refs: [{ref,fileId,exId,q,type,key}]; loadFile(fileId) → parsed file | null.
export default function ExercisePlayer({ refs, loadFile, mode, runId = null, variant = null, index, onAttempt, onComplete, onFinish, onExit }) {
  const [files, setFiles] = useState(null) // fileId -> parsed file
  const [pos, setPos] = useState(0)
  const [chosen, setChosen] = useState(null)
  const [plays, setPlays] = useState(0)
  const [results, setResults] = useState([]) // { r, correct, chosen }
  const shownAt = useRef(Date.now())
  const answered = useRef(false)
  const loadRef = useRef(loadFile)
  loadRef.current = loadFile
  const completed = useRef(false)
  const isTest = mode === 'test'

  useEffect(() => {
    let alive = true
    const ids = [...new Set(refs.map((r) => r.fileId))]
    Promise.all(ids.map(async (id) => [id, await loadRef.current(id)])).then((rows) => {
      if (alive) setFiles(Object.fromEntries(rows))
    })
    return () => { alive = false }
  }, [refs])

  const failed = files ? Object.values(files).filter((f) => !f).length : 0
  const playable = useMemo(() => {
    if (!files) return []
    return refs.flatMap((r) => {
      const ex = files[r.fileId]?.exercises?.find((e) => e.id === r.exId)
      const q = ex?.questions?.[r.q]
      return ex && q ? [{ r, ex, q }] : []
    })
  }, [files, refs])

  const cur = playable[pos]
  useEffect(() => {
    shownAt.current = Date.now()
    answered.current = false
    setChosen(null)
    setPlays(0)
    window.speechSynthesis?.cancel()
  }, [pos, files])
  useEffect(() => () => window.speechSynthesis?.cancel(), [])
  const ended = files != null && playable.length > 0 && pos >= playable.length
  useEffect(() => {
    if (!ended || completed.current) return
    completed.current = true
    onComplete?.({ correct: results.filter((x) => x.correct).length, total: results.length })
  }, [ended]) // eslint-disable-line react-hooks/exhaustive-deps

  function leave() {
    if (isTest && ended) return onExit?.({ correct: 0, total: 0, finished: true })
    if (isTest && !window.confirm("Abandon test? It won't count.")) return
    onExit?.({ correct: results.filter((x) => x.correct).length, total: results.length })
  }

  if (!files) return <p className="py-10 text-center font-sans text-sm text-ink/50">Loading exercises…</p>

  if (playable.length === 0 || pos >= playable.length) {
    const correct = results.filter((x) => x.correct).length
    const misses = results.filter((x) => !x.correct)
    return (
      <div className="mx-auto max-w-lg py-4">
        {playable.length === 0 ? (
          <p className="py-6 text-center font-sans text-sm text-ink/60">No questions could be loaded.</p>
        ) : (
          <>
            <p className="text-center font-display text-2xl font-bold text-ink">{correct} / {results.length} correct</p>
            {isTest && <p className="mt-1 text-center font-mono text-xs text-ink/50">Saved as latest score for Test {variant}</p>}
            {misses.length > 0 && (
              <div className="mt-5 flex flex-col gap-2">
                <h4 className="font-display text-xs font-bold tracking-wide text-ink/60">Misses</h4>
                {misses.map(({ r, q, chosen: c }) => {
                  const it = index?.get(r.key)
                  return (
                    <div key={r.ref} className="rounded-xl border border-ink/10 bg-white/50 p-3">
                      <div className="font-sans text-sm text-ink">
                        <span className="font-display">{it?.hanzi ?? r.key.split('|')[0]}</span>{' '}
                        <span className="font-mono text-xs text-cinnabar">{it?.pinyin ?? ''}</span>
                      </div>
                      <div className="break-words font-sans text-xs text-cinnabar line-through">{c}</div>
                      <div className="break-words font-sans text-xs text-jade">{q.answer}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
        {failed > 0 && <p className="mt-3 text-center font-mono text-xs text-ink/50">{failed} file{failed > 1 ? 's' : ''} couldn't load</p>}
        <button onClick={() => onFinish?.({ correct, total: results.length })} className="mt-6 w-full rounded-xl bg-cinnabar py-3 font-display font-bold text-paper">Done</button>
      </div>
    )
  }

  const { r, ex, q } = cur
  const item = index?.get(r.key)
  const done = chosen != null
  const blank = q.blank

  function choose(opt) {
    if (answered.current) return // only the first tap counts
    answered.current = true
    setChosen(opt)
    const correct = opt === q.answer
    const attempt = {
      id: newId('a'), at: new Date().toISOString(),
      fileId: r.fileId, exId: r.exId, q: r.q, key: r.key, type: ex.type,
      mode, runId: mode === 'test' ? runId : null,
      correct, chosen: opt, ms: Math.max(1, Date.now() - shownAt.current),
    }
    setResults((x) => [...x, { r, q, correct, chosen: opt }])
    onAttempt?.(attempt)
  }

  async function play() {
    setPlays((n) => n + 1)
    await speakAsync(ex.audioText)
  }

  const optClass = (opt) => {
    const base = 'w-full break-words rounded-xl border px-4 py-3 text-left font-sans text-base transition '
    if (!done) return base + 'border-ink/15 bg-white/60 text-ink hover:border-cinnabar'
    if (opt === q.answer) return base + 'border-jade bg-jade/15 text-ink'
    if (opt === chosen) return base + 'border-cinnabar bg-cinnabar/15 text-ink'
    return base + 'border-ink/10 bg-white/40 text-ink/45'
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={leave} className="font-mono text-xs text-ink/50 hover:text-ink">← 結束</button>
        <span className="font-mono text-xs text-ink/45">
          {isTest ? `Test · Variant ${variant} · ${pos + 1}/${playable.length}` : `${pos + 1} / ${playable.length}`}
        </span>
      </div>
      {failed > 0 && <p className="mb-2 font-mono text-xs text-ink/50">{failed} file{failed > 1 ? 's' : ''} couldn't load</p>}

      <div className="mb-4 rounded-2xl border border-ink/10 bg-white/50 p-4">
        {(ex.type === 'cloze' || ex.type === 'pattern-cloze') && <Passage text={ex.passage} active={blank} filled={done ? q.answer : null} />}
        {ex.type === 'fill' && <Passage text={ex.sentence} active={1} filled={done ? q.answer : null} />}
        {ex.type === 'usage' && <p className="break-words font-display text-lg text-ink">{q.prompt}</p>}
        {ex.type === 'listening' && (
          <div className="flex flex-col gap-3">
            <button onClick={play} className="self-start rounded-full bg-ink px-4 py-2 font-sans text-sm text-paper">
              ▶ {plays === 0 ? '播放' : `再聽 (${plays})`}
            </button>
            <p className="break-words font-display text-lg text-ink">{q.prompt}</p>
            {done && (
              <p className="break-words rounded-lg bg-ink/5 p-2 font-display text-base text-ink">
                {ex.audioText}
                {item && <span className="block font-mono text-xs text-cinnabar">{item.hanzi} {item.pinyin}</span>}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {q.options.map((opt) => (
          <button key={opt} disabled={done} onClick={() => choose(opt)} className={optClass(opt)}>{opt}</button>
        ))}
      </div>

      {done && (
        <div className="mt-4 rounded-2xl border border-ink/10 bg-white/50 p-4">
          <p className={`mb-1 font-display text-sm font-bold ${chosen === q.answer ? 'text-jade' : 'text-cinnabar'}`}>
            {chosen === q.answer ? '✓ Correct' : '✗ Not quite'}
          </p>
          <p className="font-sans text-sm text-ink/75">{q.explanation}</p>
          <p className="mt-2 break-words font-sans text-sm text-ink">
            <span className="font-display">{item?.hanzi ?? r.key.split('|')[0]}</span>{' '}
            <span className="font-mono text-xs text-cinnabar">{item?.pinyin ?? ''}</span>{' '}
            <span className="text-ink/60">{item?.english ?? ''}</span>
          </p>
          <button onClick={() => setPos(pos + 1)} className="mt-3 w-full rounded-xl bg-cinnabar py-3 font-display font-bold text-paper">
            {pos + 1 < playable.length ? 'Next' : 'Finish'}
          </button>
        </div>
      )}
    </div>
  )
}
