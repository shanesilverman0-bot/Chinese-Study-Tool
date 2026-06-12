// src/components/DangdaiFilter.jsx
// Study filter UI for CCCC (dangdai) vocab packs.
// Renders a collapsible Book → Chapter → List selector tree.
//
// Props:
//   vocab        — full normalized vocab array from loaded pack(s)
//   filter       — current filter: { book, chapter, list } (nulls = all)
//   onChange     — (newFilter) => void
//   progress     — progress.cards map (for due/seen counts per node)

import React, { useMemo, useState } from 'react'
import { filterVocab } from '../lib/vocab.js'

// Count cards that are due, seen (not due), and unseen for a vocab slice.
function countCards(vocab, progressCards) {
  let due = 0, seen = 0, unseen = 0
  const now = Date.now()
  for (const v of vocab) {
    const id = `${v.hanzi}|${v.pinyin}`
    const card = progressCards?.[id]
    if (!card) { unseen++; continue }
    const dueDate = card.due ? new Date(card.due).getTime() : 0
    if (dueDate <= now) due++; else seen++
  }
  return { due, seen, unseen, total: vocab.length }
}

function Badge({ count, color }) {
  if (!count) return null
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded-full font-medium"
      style={{ background: color + '33', color }}
    >
      {count}
    </span>
  )
}

function NodeCounts({ counts }) {
  return (
    <span className="flex gap-1 ml-auto">
      <Badge count={counts.due}    color="#ef4444" />
      <Badge count={counts.seen}   color="#22c55e" />
      <Badge count={counts.unseen} color="#94a3b8" />
    </span>
  )
}

export default function DangdaiFilter({ vocab, filter, onChange, progress }) {
  const [expandedBooks, setExpandedBooks] = useState(new Set())

  // Build tree: book → chapters → lists
  const tree = useMemo(() => {
    const books = {}
    for (const v of vocab) {
      if (v.book == null) continue
      const b = v.book
      if (!books[b]) books[b] = {}
      const c = v.chapter ?? 0
      if (!books[b][c]) books[b][c] = new Set()
      if (v.list) books[b][c].add(v.list)
    }
    // Sort
    return Object.entries(books)
      .sort(([a],[b]) => Number(a) - Number(b))
      .map(([book, chapters]) => ({
        book: Number(book),
        chapters: Object.entries(chapters)
          .sort(([a],[b]) => Number(a) - Number(b))
          .map(([chapter, lists]) => ({
            chapter: Number(chapter) || null,
            lists: [...lists].sort(),
          }))
      }))
  }, [vocab])

  const progressCards = progress?.cards

  const isActive = (b, c, l) =>
    filter.book === b &&
    (c == null || filter.chapter === c) &&
    (l == null || filter.list === l)

  const handleBookClick = (book) => {
    setExpandedBooks(prev => {
      const next = new Set(prev)
      if (next.has(book)) next.delete(book); else next.add(book)
      return next
    })
  }

  const handleSelect = (book, chapter, list) => {
    onChange({ book, chapter: chapter ?? null, list: list ?? null })
  }

  const clearFilter = () => onChange({ book: null, chapter: null, list: null })

  return (
    <div className="w-full">
      {/* All / clear */}
      <button
        onClick={clearFilter}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium mb-1 transition-colors ${
          !filter.book
            ? 'bg-blue-600 text-white'
            : 'text-slate-300 hover:bg-slate-700'
        }`}
      >
        全部 (All vocab)
        {!filter.book && (
          <NodeCounts counts={countCards(vocab, progressCards)} />
        )}
      </button>

      {/* Book tree */}
      {tree.map(({ book, chapters }) => {
        const bookVocab = filterVocab(vocab, { book })
        const bookCounts = countCards(bookVocab, progressCards)
        const expanded = expandedBooks.has(book)
        const bookActive = filter.book === book && filter.chapter == null

        return (
          <div key={book} className="mb-1">
            {/* Book row */}
            <div className="flex items-center">
              <button
                onClick={() => handleBookClick(book)}
                className="text-slate-400 hover:text-slate-200 w-5 text-xs"
              >
                {expanded ? '▾' : '▸'}
              </button>
              <button
                onClick={() => handleSelect(book, null, null)}
                className={`flex-1 flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                  bookActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                <span className="font-medium">Book {book}</span>
                <span className="text-xs opacity-60">({bookVocab.length})</span>
                {bookActive && <NodeCounts counts={bookCounts} />}
              </button>
            </div>

            {/* Chapters */}
            {expanded && chapters.map(({ chapter, lists }) => {
              const chapterVocab = filterVocab(vocab, { book, chapter })
              const chapterCounts = countCards(chapterVocab, progressCards)
              const chapterActive = filter.book === book && filter.chapter === chapter && filter.list == null

              return (
                <div key={chapter} className="ml-5 mt-0.5">
                  {/* Chapter row */}
                  <button
                    onClick={() => handleSelect(book, chapter, null)}
                    className={`w-full flex items-center gap-1 px-2 py-1 rounded-lg text-sm transition-colors ${
                      chapterActive
                        ? 'bg-blue-500 text-white'
                        : 'text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    <span>Ch. {chapter}</span>
                    <span className="text-xs opacity-60">({chapterVocab.length})</span>
                    {chapterActive && <NodeCounts counts={chapterCounts} />}
                  </button>

                  {/* Lists */}
                  {lists.length > 0 && (
                    <div className="ml-3 mt-0.5 flex gap-1">
                      {lists.map((list) => {
                        const listVocab = filterVocab(vocab, { book, chapter, list })
                        const listCounts = countCards(listVocab, progressCards)
                        const listActive = isActive(book, chapter, list)

                        return (
                          <button
                            key={list}
                            onClick={() => handleSelect(book, chapter, list)}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
                              listActive
                                ? 'bg-blue-400 text-white'
                                : 'text-slate-500 hover:bg-slate-700'
                            }`}
                          >
                            List {list}
                            <span className="opacity-60">({listVocab.length})</span>
                            {listActive && (
                              <span className="flex gap-0.5">
                                {listCounts.due > 0 && (
                                  <span style={{ color: '#ef4444' }}>{listCounts.due}</span>
                                )}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {/* Legend */}
      <div className="flex gap-3 mt-3 pt-3 border-t border-slate-700 text-xs text-slate-500">
        <span><span style={{color:'#ef4444'}}>■</span> 到期</span>
        <span><span style={{color:'#22c55e'}}>■</span> 已學</span>
        <span><span style={{color:'#94a3b8'}}>■</span> 未見</span>
      </div>
    </div>
  )
}
