import React, { useState } from 'react'
import { LEVELS, LEVEL_LABELS } from '../data/vocab.js'
import { isDue, cardKey } from '../lib/fsrs.js'

// Bucket a level's cards into four mutually-exclusive groups so the stacked bar
// segments sum to the level total. Order matters: unseen → due → mastered →
// learned. Null-safe because vocab can grow a render before progress reconciles.
export function computeBandStats(vocab, progress, level) {
  const bandVocab = vocab.filter((v) => v.source === 'tocfl' && v.level === level)
  const now = new Date()
  let mastered = 0
  let learned = 0
  let due = 0
  let unseen = 0
  for (const v of bandVocab) {
    const card = progress.cards[cardKey(v)]
    if (!card || card.reps === 0) {
      unseen++ // no progress record yet
    } else if (isDue(card, now)) {
      due++ // reviewed before, due now
    } else if (card.stability > 30) {
      mastered++ // stable beyond 30 days
    } else {
      learned++ // reviewed, not due, not yet mastered
    }
  }
  return { mastered, learned, due, unseen, total: bandVocab.length }
}

export function BandProgressBar({ mastered, learned, due, unseen }) {
  const total = mastered + learned + due + unseen
  if (total === 0) return null
  const masteredPct = (mastered / total) * 100
  const learnedPct = (learned / total) * 100
  const duePct = (due / total) * 100
  const unseenPct = (unseen / total) * 100

  return (
    <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-ink/10">
      {mastered > 0 && (
        <div style={{ width: `${masteredPct}%`, backgroundColor: '#1D9E75' }} title={`${mastered} mastered`} />
      )}
      {learned > 0 && (
        <div style={{ width: `${learnedPct}%`, backgroundColor: '#378ADD' }} title={`${learned} learned`} />
      )}
      {due > 0 && (
        <div style={{ width: `${duePct}%`, backgroundColor: '#E24B4A' }} title={`${due} due`} />
      )}
      {unseen > 0 && (
        <div style={{ width: `${unseenPct}%`, backgroundColor: '#e8e0d2' }} title={`${unseen} unseen`} />
      )}
    </div>
  )
}

export function TOCFLMasteryPanel({ vocab, progress }) {
  const [expanded, setExpanded] = useState(true)

  if (!vocab.some((v) => v.source === 'tocfl')) return null

  return (
    <div className="rounded-2xl border border-ink/10 bg-white/50 p-5">
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <h3 className="font-display text-sm font-bold tracking-wide text-ink/70">
          TOCFL 掌握度 · Level mastery
        </h3>
        <span className="font-mono text-xs text-ink/40">{expanded ? '−' : '+'}</span>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3">
          {LEVELS.map((band) => {
            const stats = computeBandStats(vocab, progress, band)
            if (stats.total === 0) return null
            return (
              <div key={band}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="font-sans text-sm text-ink/80">
                    {LEVEL_LABELS[band]}{' '}
                    <span className="font-mono text-xs text-ink/40">{band}</span>
                  </span>
                  <span className="font-mono text-xs text-ink/50">
                    {stats.mastered} · {stats.learned} · {stats.due} · {stats.unseen}
                  </span>
                </div>
                <BandProgressBar {...stats} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Compute per-list stats for a CCCC list (book/chapter/list).
function computeCcccListStats(vocab, progress, book, chapter, list) {
  const listVocab = vocab.filter(
    (v) => v.source === 'cccc' && v.book === book && v.chapter === chapter && v.list === list
  )
  const now = new Date()
  let mastered = 0, learned = 0, due = 0, unseen = 0
  for (const v of listVocab) {
    const card = progress.cards[cardKey(v)]
    if (!card || card.reps === 0) unseen++
    else if (isDue(card, now)) due++
    else if (card.stability > 30) mastered++
    else learned++
  }
  return { mastered, learned, due, unseen, total: listVocab.length }
}

export function CCCCMasteryPanel({ vocab, progress }) {
  const [expanded, setExpanded] = useState(true)
  const [openBooks, setOpenBooks] = useState({})
  const [openChapters, setOpenChapters] = useState({})

  const ccccVocab = vocab.filter((v) => v.source === 'cccc')

  return (
    <div className="rounded-2xl border border-ink/10 bg-white/50 p-5">
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <h3 className="font-display text-sm font-bold tracking-wide text-ink/70">
          當代中文掌握度 · Contemporary Chinese
        </h3>
        <span className="font-mono text-xs text-ink/40">{expanded ? '−' : '+'}</span>
      </div>

      {expanded && (
        <div className="mt-3">
          {ccccVocab.length === 0 ? (
            <p className="py-4 text-center font-sans text-sm text-ink/50">
              Upload vocab packs via Settings → Vocab Packs
            </p>
          ) : (
            <div className="space-y-1">
              {[...new Set(ccccVocab.map((v) => v.book))].sort((a, b) => a - b).map((book) => {
                const bookVocab = ccccVocab.filter((v) => v.book === book)
                const bookOpen = openBooks[book]
                const chapters = [...new Set(bookVocab.map((v) => v.chapter))].sort((a, b) => a - b)
                // Roll up stats for the book row
                const now = new Date()
                let bm = 0, bl = 0, bd = 0, bu = 0
                for (const v of bookVocab) {
                  const card = progress.cards[cardKey(v)]
                  if (!card || card.reps === 0) bu++
                  else if (isDue(card, now)) bd++
                  else if (card.stability > 30) bm++
                  else bl++
                }
                return (
                  <div key={book}>
                    <div
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-ink/5"
                      onClick={() => setOpenBooks((p) => ({ ...p, [book]: !p[book] }))}
                    >
                      <span className="font-mono text-xs text-ink/40 w-4">{bookOpen ? '−' : '+'}</span>
                      <span className="flex-1 font-sans text-sm font-medium text-ink">
                        Book {book}
                      </span>
                      <span className="font-mono text-xs text-ink/50">
                        {bm} · {bl} · {bd} · {bu}
                      </span>
                    </div>
                    {bookOpen && (
                      <div className="ml-6 space-y-1">
                        {chapters.map((chapter) => {
                          const chKey = `${book}-${chapter}`
                          const chOpen = openChapters[chKey]
                          const chVocab = bookVocab.filter((v) => v.chapter === chapter)
                          const lists = [...new Set(chVocab.map((v) => v.list))].sort((a, b) => a - b)
                          let cm = 0, cl = 0, cd = 0, cu = 0
                          for (const v of chVocab) {
                            const card = progress.cards[cardKey(v)]
                            if (!card || card.reps === 0) cu++
                            else if (isDue(card, now)) cd++
                            else if (card.stability > 30) cm++
                            else cl++
                          }
                          return (
                            <div key={chapter}>
                              <div
                                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-ink/5"
                                onClick={() => setOpenChapters((p) => ({ ...p, [chKey]: !p[chKey] }))}
                              >
                                <span className="font-mono text-xs text-ink/40 w-4">{chOpen ? '−' : '+'}</span>
                                <span className="flex-1 font-sans text-xs text-ink/80">Ch. {chapter}</span>
                                <span className="font-mono text-xs text-ink/50">
                                  {cm} · {cl} · {cd} · {cu}
                                </span>
                              </div>
                              {chOpen && (
                                <div className="ml-6 space-y-1">
                                  {lists.map((list) => {
                                    const s = computeCcccListStats(vocab, progress, book, chapter, list)
                                    return (
                                      <div key={list} className="px-2 py-1.5">
                                        <div className="flex items-center justify-between">
                                          <span className="font-sans text-xs text-ink/70">List {list}</span>
                                          <span className="font-mono text-xs text-ink/50">
                                            {s.mastered} · {s.learned} · {s.due} · {s.unseen}
                                          </span>
                                        </div>
                                        <BandProgressBar {...s} />
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
