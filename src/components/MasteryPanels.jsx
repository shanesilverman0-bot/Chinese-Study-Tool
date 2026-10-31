import React, { useMemo, useState } from 'react'
import { LEVELS, LEVEL_LABELS } from '../data/vocab.js'
import { statusSummary } from '../lib/lists.js'

const fmt = (n) => n.toLocaleString('en-US')

// Segment colours shared by every bar on the Lists page.
const SEGMENTS = [
  ['reviewed', '#1D9E75', 'known'],
  ['baseline', '#b8860b', 'baseline'],
  ['learning', '#378ADD', 'learning'],
  ['fresh', '#e8e0d2', 'new'],
]

// Stacked bar from a statusSummary(): known (reviewed) · known (baseline) · learning · new.
export function StatusBar({ s }) {
  if (!s || s.total === 0) return null
  const parts = { reviewed: s.known - s.baseline, baseline: s.baseline, learning: s.learning, fresh: s.fresh }
  return (
    <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-ink/10">
      {SEGMENTS.map(([k, color, label]) => parts[k] > 0 && (
        <div key={k} style={{ width: `${(parts[k] / s.total) * 100}%`, backgroundColor: color }} title={`${parts[k]} ${label}`} />
      ))}
    </div>
  )
}

export function StatusLegend() {
  return (
    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-ink/45">
      {SEGMENTS.map(([k, color, label]) => (
        <span key={k} className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{label}
        </span>
      ))}
      <span>· numbers: items · due·new·known</span>
    </div>
  )
}

export function StatusNums({ s }) {
  return (
    <span className="shrink-0 font-mono text-[11px] text-ink/45">
      {fmt(s.total)} · <span className={s.due ? 'text-cinnabar' : ''}>{fmt(s.due)}</span>·{fmt(s.fresh)}·{fmt(s.known)}
    </span>
  )
}

export function TOCFLMasteryPanel({ vocab, ctx }) {
  const [expanded, setExpanded] = useState(true)
  const byLevel = useMemo(() => {
    const out = new Map()
    for (const level of LEVELS) {
      const keys = vocab.filter((v) => v.source === 'tocfl' && v.level === level).map((v) => v.key ?? `${v.hanzi}|${v.pinyin}`)
      out.set(level, statusSummary(keys, ctx))
    }
    return out
  }, [vocab, ctx])

  if (!vocab.some((v) => v.source === 'tocfl')) return null

  return (
    <div className="rounded-2xl border border-ink/10 bg-white/50 p-5">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setExpanded(!expanded)}>
        <h3 className="font-display text-sm font-bold tracking-wide text-ink/70">TOCFL 掌握度 · Level mastery</h3>
        <span className="font-mono text-xs text-ink/40">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div className="mt-4 space-y-3">
          {LEVELS.map((level) => {
            const s = byLevel.get(level)
            if (!s?.total) return null
            return (
              <div key={level}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-sans text-sm text-ink/80">
                    {LEVEL_LABELS[level]} <span className="font-mono text-xs text-ink/40">{level}</span>
                  </span>
                  <StatusNums s={s} />
                </div>
                <StatusBar s={s} />
              </div>
            )
          })}
          <StatusLegend />
        </div>
      )}
    </div>
  )
}

// CCC lists as one tree: Book → Chapter → Part. Chapter and part rows open the list;
// the ± buttons expand. Every row has its own bar. `open`/`setOpen` live in the parent so
// the tree stays expanded after visiting a list.
export function CCCTree({ lists, ctx, onOpen, open, setOpen }) {
  const openBooks = open.books
  const openChapters = open.chapters
  const setOpenBooks = (fn) => setOpen((o) => ({ ...o, books: fn(o.books) }))
  const setOpenChapters = (fn) => setOpen((o) => ({ ...o, chapters: fn(o.chapters) }))

  const tree = useMemo(() => {
    const books = new Map()
    for (const l of lists) {
      if (l.sourceType !== 'ccc') continue
      const { book, chapter, part } = l.source
      if (!books.has(book)) books.set(book, { book, keys: [], chapters: new Map() })
      const b = books.get(book)
      if (!b.chapters.has(chapter)) b.chapters.set(chapter, { chapter, list: null, parts: [] })
      const ch = b.chapters.get(chapter)
      if (part == null) { ch.list = l; b.keys.push(...l.itemKeys) } else ch.parts.push(l)
    }
    return [...books.values()].sort((a, b) => a.book - b.book).map((b) => ({
      ...b,
      summary: statusSummary(b.keys, ctx),
      chapters: [...b.chapters.values()].sort((x, y) => x.chapter - y.chapter).map((ch) => ({
        ...ch,
        summary: ch.list ? statusSummary(ch.list.itemKeys, ctx) : null,
        parts: ch.parts.map((p) => ({ list: p, summary: statusSummary(p.itemKeys, ctx) })),
      })),
    }))
  }, [lists, ctx])

  if (tree.length === 0) return <p className="font-sans text-sm text-ink/50">No CCC lists.</p>

  const Toggle = ({ open, onClick }) => (
    <button onClick={onClick} className="flex h-8 w-8 shrink-0 items-center justify-center font-mono text-sm text-ink/45 hover:text-ink" aria-label={open ? 'Collapse' : 'Expand'}>
      {open ? '−' : '+'}
    </button>
  )

  return (
    <div className="flex flex-col">
      {tree.map((b) => {
        const bOpen = !!openBooks[b.book]
        return (
          <div key={b.book} className="border-b border-ink/5 last:border-0">
            <button onClick={() => setOpenBooks((p) => ({ ...p, [b.book]: !bOpen }))} className="flex w-full items-center gap-1 rounded-lg py-2 pr-2 text-left hover:bg-ink/5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center font-mono text-sm text-ink/45">{bOpen ? '−' : '+'}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-sans text-sm font-semibold text-ink">第{b.book}冊 · Book {b.book}</span>
                  <StatusNums s={b.summary} />
                </span>
                <StatusBar s={b.summary} />
              </span>
            </button>
            {bOpen && (
              <div className="mb-2 ml-6 flex flex-col">
                {b.chapters.map((ch) => {
                  const ck = `${b.book}-${ch.chapter}`
                  const cOpen = !!openChapters[ck]
                  return (
                    <div key={ck}>
                      <div className="flex items-center gap-1">
                        {ch.parts.length > 0
                          ? <Toggle open={cOpen} onClick={() => setOpenChapters((p) => ({ ...p, [ck]: !cOpen }))} />
                          : <span className="w-8 shrink-0" />}
                        <button onClick={() => ch.list && onOpen(ch.list.id)} className="min-w-0 flex-1 rounded-lg py-1.5 pr-2 text-left hover:bg-ink/5">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="font-sans text-sm text-ink/80">第{ch.chapter}課 · Ch. {ch.chapter}</span>
                            {ch.summary && <StatusNums s={ch.summary} />}
                          </span>
                          <StatusBar s={ch.summary} />
                        </button>
                      </div>
                      {cOpen && ch.parts.map(({ list, summary }) => (
                        <button key={list.id} onClick={() => onOpen(list.id)} className="ml-14 flex w-[calc(100%-3.5rem)] flex-col rounded-lg py-1.5 pr-2 text-left hover:bg-ink/5">
                          <span className="flex w-full items-baseline justify-between gap-2">
                            <span className="font-sans text-xs text-ink/70">Part {list.source.part}</span>
                            <StatusNums s={summary} />
                          </span>
                          <span className="w-full"><StatusBar s={summary} /></span>
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
