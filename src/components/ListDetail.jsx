import React, { useMemo, useState } from 'react'
import ExerciseImport from './ExerciseImport.jsx'
import { addItems, removeItems, renameList, searchItems, itemStatus, variantsOf, variantFiles, latestScore, nextVariant } from '../lib/lists.js'
import { batchesOf } from '../lib/exerciseInput.js'
import { contextStats, groupAttempts } from '../lib/context.js'
import UnderstandingBar from './UnderstandingBar.jsx'

const CHIP = {
  new: 'bg-ink/10 text-ink/60',
  learning: 'bg-[#378ADD]/15 text-[#1a6b8a]',
  known: 'bg-jade/15 text-jade',
  baseline: 'bg-[#b8860b]/15 text-[#b8860b]',
}

export default function ListDetail({ list, index, progress, baseline, upsertList, updateProgress, deviceSettings, onBack, onDelete, onStudy, onPractice, onTakeTest }) {
  const custom = list.sourceType === 'custom'
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('items')
  const settings = progress.studySettings

  const tz = settings?.timeZone
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: tz || undefined })
  const variants = useMemo(() => variantsOf(list.id, progress.exerciseFiles), [list.id, progress.exerciseFiles])
  const nextV = useMemo(() => nextVariant(list.id, progress.exerciseFiles, progress.testRuns), [list.id, progress.exerciseFiles, progress.testRuns])
  const totalBatches = useMemo(() => batchesOf(list).length, [list])
  const [chooseV, setChooseV] = useState(false)
  const history = useMemo(
    () => (progress.testRuns ?? [])
      .filter((r) => !r.deleted && r.listId === list.id && r.status === 'finished')
      .sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt))),
    [progress.testRuns, list.id]
  )
  const unfinished = (progress.testRuns ?? []).filter((r) => !r.deleted && r.listId === list.id && r.status !== 'finished').length

  const results = useMemo(() => (custom ? searchItems(index, q, 50) : []), [custom, index, q])
  const inList = useMemo(() => new Set(list.itemKeys), [list.itemKeys])

  const attemptGroup = useMemo(() => groupAttempts(progress), [progress.attempts]) // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(
    () => list.itemKeys.map((k) => {
      const it = index.get(k)
      return {
        key: k, it,
        ctx: contextStats(k, progress, settings, attemptGroup),
        status: itemStatus(k, { index, cards: progress.cards, baseline, settings }),
      }
    }),
    [list.itemKeys, index, progress.cards, progress.contextArchive, progress.sentences, attemptGroup, baseline, settings]
  )

  return (
    <div className="brush-in flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="font-mono text-xs text-ink/50 hover:text-ink">← 清單</button>
        <button onClick={onStudy} className="rounded-full bg-cinnabar px-4 py-1.5 font-display text-sm font-bold text-paper">
          Study this list
        </button>
      </div>

      {custom ? (
        <input
          defaultValue={list.name} key={list.id}
          onBlur={(e) => { if (e.target.value.trim() && e.target.value !== list.name) upsertList(renameList(list, e.target.value)) }}
          className="rounded-lg border border-ink/15 bg-transparent px-3 py-2 font-display text-lg font-bold text-ink"
        />
      ) : (
        <h3 className="font-display text-lg font-bold text-ink">{list.name}</h3>
      )}
      <p className="font-mono text-xs text-ink/45">{rows.length} items</p>

      <div className="flex gap-2">
        {[['items', '字詞 · Items'], ['ex', '練習題 · Exercises']].map(([id, label]) => (
          <button
            key={id} onClick={() => setTab(id)}
            className={`rounded-full px-3 py-1.5 font-sans text-xs ${tab === id ? 'bg-ink text-paper' : 'border border-ink/20 text-ink/60'}`}
          >{label}</button>
        ))}
      </div>

      {tab === 'ex' && (
        <button onClick={onPractice} className="self-start rounded-full bg-cinnabar px-4 py-1.5 font-display text-sm font-bold text-paper">
          Practice
        </button>
      )}
      {tab === 'ex' && (
        <div className="rounded-2xl border border-ink/10 bg-white/50 p-4">
          <h4 className="font-display text-sm font-bold text-ink">測驗 · Tests</h4>
          {variants.length === 0 ? (
            <p className="mt-2 font-sans text-xs text-ink/50">Import exercise files to unlock tests.</p>
          ) : (
            <>
              <div className="mt-2 flex flex-col">
                {variants.map((v) => {
                  const r = latestScore(list.id, v, progress.testRuns)
                  const have = new Set(variantFiles(list.id, v, progress.exerciseFiles).map((f) => f.batch)).size
                  return (
                    <div key={v} className="flex min-h-[36px] flex-wrap items-center gap-x-2 border-b border-ink/5 py-1 font-sans text-sm text-ink">
                      <span>
                        Test {v} — {r ? `${r.correct}/${r.total} (${r.total ? Math.round((100 * r.correct) / r.total) : 0}%) · ${fmtDate(r.finishedAt)}` : 'not taken'}
                      </span>
                      {have < totalBatches && <span className="font-mono text-[10px] text-ink/45">({have} of {totalBatches} batches)</span>}
                      {chooseV && <button onClick={() => { setChooseV(false); onTakeTest(list.id, v) }} className="ml-auto rounded-full border border-ink/20 px-3 py-1 text-xs text-ink/70 hover:border-cinnabar">Take</button>}
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button onClick={() => onTakeTest(list.id, nextV)} className="rounded-full bg-cinnabar px-4 py-1.5 font-display text-sm font-bold text-paper">
                  Take test{nextV != null ? ` ${nextV}` : ''}
                </button>
                {variants.length > 1 && (
                  <button onClick={() => setChooseV((x) => !x)} className="font-sans text-xs text-ink/50 underline">choose variant</button>
                )}
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer font-mono text-xs text-ink/50">History ({history.length})</summary>
                <div className="mt-1 flex flex-col">
                  {history.length === 0 && <p className="py-1 font-sans text-xs text-ink/45">No finished tests yet.</p>}
                  {history.map((r) => (
                    <p key={r.id} className="border-b border-ink/5 py-1 font-sans text-xs text-ink/70">
                      {fmtDate(r.finishedAt)} · Test {r.variant} · {r.correct}/{r.total}
                    </p>
                  ))}
                  {unfinished > 0 && <p className="pt-1 font-mono text-[10px] text-ink/40">{unfinished} abandoned or unfinished run{unfinished > 1 ? 's' : ''} not counted</p>}
                </div>
              </details>
            </>
          )}
        </div>
      )}
      {tab === 'ex' && (
        <ExerciseImport list={list} index={index} progress={progress} updateProgress={updateProgress} settings={deviceSettings} />
      )}

      {tab === 'items' && custom && (
        <div className="rounded-2xl border border-ink/10 bg-white/50 p-4">
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add words: 漢字, pinyin or English"
            className="w-full rounded-lg border border-ink/15 bg-transparent px-3 py-2 font-sans text-sm"
          />
          {q.trim() && (
            <div className="mt-2 flex flex-col">
              {results.length === 0 && <p className="py-2 font-sans text-sm text-ink/50">No matches.</p>}
              {results.map((it) => (
                <div key={it.key} className="flex min-h-[40px] items-center gap-2 border-b border-ink/5 py-1">
                  <span className="font-display text-base text-ink">{it.hanzi}</span>
                  <span className="font-mono text-xs text-cinnabar">{it.pinyin}</span>
                  <span className="min-w-0 flex-1 truncate font-sans text-xs text-ink/55">{it.english}</span>
                  {inList.has(it.key)
                    ? <span className="font-mono text-xs text-ink/35">added</span>
                    : <button onClick={() => upsertList(addItems(list, [it.key]))} className="rounded-full border border-ink/20 px-3 py-1 font-sans text-xs text-ink/70 hover:border-jade hover:text-jade">Add</button>}
                </div>
              ))}
              {results.length >= 50 && <p className="pt-1 font-mono text-[10px] text-ink/40">Showing the first 50 matches.</p>}
            </div>
          )}
        </div>
      )}

      {tab === 'items' && <div className="flex flex-col">
        {rows.length === 0 && <p className="py-4 text-center font-sans text-sm text-ink/50">This list is empty.</p>}
        {rows.map(({ key, it, status, ctx }) => (
          <div key={key} className="border-b border-ink/5">
          <div className="flex min-h-[44px] items-center gap-2 py-1.5">
            <span className="font-display text-base text-ink">{it?.hanzi ?? key.split('|')[0]}</span>
            <span className="font-mono text-xs text-cinnabar">{it?.pinyin ?? ''}</span>
            <span className="min-w-0 flex-1 truncate font-sans text-xs text-ink/55">{it?.english ?? ''}</span>
            {it?.tags?.includes('outside-TOCFL') && <span className="rounded-full bg-ink/10 px-2 py-0.5 font-mono text-[10px] text-ink/50">非TOCFL</span>}
            {it?.band && <span className="font-mono text-[10px] text-ink/40">{it.level ?? it.band}</span>}
            <UnderstandingBar value={ctx.understanding} max={ctx.max} />
            <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${CHIP[status]}`}>{status}</span>
            {custom && (
              <button onClick={() => upsertList(removeItems(list, [key]))} className="font-sans text-xs text-ink/40 hover:text-cinnabar">Remove</button>
            )}
          </div>
          {progress.itemNotes?.[key]?.pleco?.defn && (
            <details className="pb-1.5 pl-1">
              <summary className="cursor-pointer font-mono text-[10px] text-ink/45">Pleco</summary>
              <p className="whitespace-pre-wrap font-sans text-xs text-ink/60">{progress.itemNotes[key].pleco.defn}</p>
            </details>
          )}
          </div>
        ))}
      </div>}

      {tab === 'items' && custom && (
        <button
          onClick={() => { if (window.confirm(`Delete "${list.name}"?`)) onDelete() }}
          className="self-start font-sans text-xs text-ink/40 hover:text-cinnabar"
        >
          Delete list
        </button>
      )}
    </div>
  )
}
