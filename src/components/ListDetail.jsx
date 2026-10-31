import React, { useMemo, useState } from 'react'
import { addItems, removeItems, renameList, searchItems, itemStatus } from '../lib/lists.js'

const CHIP = {
  new: 'bg-ink/10 text-ink/60',
  learning: 'bg-[#378ADD]/15 text-[#1a6b8a]',
  known: 'bg-jade/15 text-jade',
  baseline: 'bg-[#b8860b]/15 text-[#b8860b]',
}

export default function ListDetail({ list, index, progress, baseline, upsertList, onBack, onDelete, onStudy }) {
  const custom = list.sourceType === 'custom'
  const [q, setQ] = useState('')
  const settings = progress.studySettings

  const results = useMemo(() => (custom ? searchItems(index, q, 50) : []), [custom, index, q])
  const inList = useMemo(() => new Set(list.itemKeys), [list.itemKeys])

  const rows = useMemo(
    () => list.itemKeys.map((k) => {
      const it = index.get(k)
      return {
        key: k, it,
        status: itemStatus(k, { index, cards: progress.cards, baseline, settings }),
      }
    }),
    [list.itemKeys, index, progress.cards, baseline, settings]
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

      {custom && (
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

      <div className="flex flex-col">
        {rows.length === 0 && <p className="py-4 text-center font-sans text-sm text-ink/50">This list is empty.</p>}
        {rows.map(({ key, it, status }) => (
          <div key={key} className="border-b border-ink/5">
          <div className="flex min-h-[44px] items-center gap-2 py-1.5">
            <span className="font-display text-base text-ink">{it?.hanzi ?? key.split('|')[0]}</span>
            <span className="font-mono text-xs text-cinnabar">{it?.pinyin ?? ''}</span>
            <span className="min-w-0 flex-1 truncate font-sans text-xs text-ink/55">{it?.english ?? ''}</span>
            {it?.tags?.includes('outside-TOCFL') && <span className="rounded-full bg-ink/10 px-2 py-0.5 font-mono text-[10px] text-ink/50">非TOCFL</span>}
            {it?.band && <span className="font-mono text-[10px] text-ink/40">{it.level ?? it.band}</span>}
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
      </div>

      {custom && (
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
