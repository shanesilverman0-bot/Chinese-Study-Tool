import React, { useState, useMemo } from 'react'
import { BANDS, BAND_LABELS } from '../data/vocab.js'
import { isDue, State, cardKey } from '../lib/fsrs.js'
import DangdaiFilter from './DangdaiFilter.jsx'

// Computes study stats from the progress object.
function computeStats(progress, vocab) {
  const cards = Object.values(progress.cards)
  const now = new Date()

  const due = cards.filter((c) => isDue(c, now)).length
  const learned = cards.filter((c) => c.reps > 0).length
  const mastered = cards.filter((c) => c.state === State.Review && c.stability >= 21).length

  // Retention: share of non-"again" ratings in the log.
  const log = progress.log || []
  const recent = log.slice(-200)
  const good = recent.filter((r) => r.rating !== 'again').length
  const retention = recent.length ? Math.round((good / recent.length) * 100) : null

  // Streak: count consecutive days (ending today/yesterday) with reviews.
  const days = new Set(log.map((r) => r.at.slice(0, 10)))
  let streak = 0
  const d = new Date()
  if (!days.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1)
  while (days.has(d.toISOString().slice(0, 10))) {
    streak++
    d.setDate(d.getDate() - 1)
  }

  return { due, learned, mastered, retention, streak }
}

function Stat({ value, label, accent }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-ink/10 bg-white/50 py-4">
      <span className="font-display text-3xl font-bold" style={{ color: accent || '#1a1614' }}>
        {value}
      </span>
      <span className="mt-1 font-mono text-[10px] uppercase tracking-widest text-ink/45">
        {label}
      </span>
    </div>
  )
}

// Bucket a band's cards into four mutually-exclusive groups so the stacked bar
// segments sum to the band total. Order matters: unseen → due → mastered →
// learned. Null-safe because vocab can grow a render before progress reconciles.
function computeBandStats(vocab, progress, band) {
  const bandVocab = vocab.filter(
    (v) => v.source === 'tocfl' &&
           (Array.isArray(v.band) ? v.band.includes(band) : v.band === band)
  )
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

function BandProgressBar({ mastered, learned, due, unseen }) {
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

function FilterCard({
  filter,
  toggleTocflBand,
  vocab,
  progress,
  filteredVocab,
  dangdaiFilter,
  setDangdaiFilter,
  onStart,
}) {
  const [activeTab, setActiveTab] = useState('tocfl')
  const now = new Date()

  const dueInFiltered = filteredVocab.filter((v) => {
    const card = progress.cards[cardKey(v)]
    return card && isDue(card, now)
  }).length

  return (
    <div className="rounded-2xl border border-ink/10 bg-white/50 p-5">
      <h3 className="mb-3 font-display text-sm font-bold tracking-wide text-ink/70">
        學習篩選 · Study filter
      </h3>

      <div className="mb-4 flex gap-2 border-b border-ink/10">
        <button
          onClick={() => setActiveTab('tocfl')}
          className={`px-3 py-2 font-sans text-sm transition ${
            activeTab === 'tocfl'
              ? 'border-b-2 border-cinnabar text-ink font-semibold'
              : 'text-ink/60 hover:text-ink'
          }`}
        >
          TOCFL 等級
        </button>
        <button
          onClick={() => setActiveTab('cccc')}
          className={`px-3 py-2 font-sans text-sm transition ${
            activeTab === 'cccc'
              ? 'border-b-2 border-cinnabar text-ink font-semibold'
              : 'text-ink/60 hover:text-ink'
          }`}
        >
          當代中文
        </button>
      </div>

      <div className="mb-5 flex flex-col gap-2">
        {activeTab === 'tocfl' && (
          <div className="space-y-3">
            {BANDS.map((band) => {
              const stats = computeBandStats(vocab, progress, band)
              const isEnabled = filter.tocfl[band] === true
              return (
                <label
                  key={band}
                  className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-ink/5"
                >
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={() => toggleTocflBand(band)}
                    className="h-4 w-4 cursor-pointer rounded"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-sans text-sm font-medium text-ink">
                        {BAND_LABELS[band]}
                      </span>
                      <span className="font-mono text-xs text-ink/60">
                        {stats.total} cards
                      </span>
                    </div>
                    <div className="mt-1 flex gap-2">
                      <span className="font-mono text-xs text-ink/50">
                        ✓ {stats.mastered}
                      </span>
                      <span className="font-mono text-xs text-ink/50">
                        ~ {stats.learned}
                      </span>
                      {stats.due > 0 && (
                        <span className="font-mono text-xs font-medium text-cinnabar">
                          ○ {stats.due}
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        )}

        {activeTab === 'cccc' && (
          vocab.some((v) => v.source === 'cccc') ? (
            <DangdaiFilter
              vocab={vocab.filter((v) => v.source === 'cccc')}
              filter={dangdaiFilter}
              onChange={setDangdaiFilter}
              progress={progress}
            />
          ) : (
            <div className="text-center py-6 text-ink/50">
              <p className="font-sans text-sm">Upload vocab packs via Settings → Vocab Packs</p>
            </div>
          )
        )}
      </div>

      <button
        onClick={onStart}
        className={`w-full rounded-xl py-3 font-display font-bold text-paper transition ${
          dueInFiltered > 0
            ? 'bg-cinnabar hover:bg-seal'
            : 'bg-ink/20 text-ink/60 cursor-not-allowed'
        }`}
      >
        {dueInFiltered > 0
          ? `開始複習 · Review ${dueInFiltered} cards`
          : dueInFiltered === 0 && filteredVocab.length > 0
            ? '沒有待複習 · No cards due'
            : '未選擇 · Nothing selected'}
      </button>
    </div>
  )
}

function TOCFLMasteryPanel({ vocab, progress }) {
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
          {BANDS.map((band) => {
            const stats = computeBandStats(vocab, progress, band)
            if (stats.total === 0) return null
            return (
              <div key={band}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="font-sans text-sm text-ink/80">
                    {BAND_LABELS[band]}{' '}
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

function CCCCMasteryPanel({ vocab, progress }) {
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

export default function Dashboard({
  progress,
  vocab,
  filter,
  toggleTocflBand,
  filteredVocab,
  dangdaiFilter,
  setDangdaiFilter,
  onStart,
}) {
  const s = computeStats(progress, vocab)

  return (
    <div className="brush-in flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <Stat value={s.due} label="due today" accent="#c0392b" />
        <Stat value={s.streak} label="day streak" accent="#b8860b" />
        <Stat value={s.learned} label="learned" accent="#2d6a4f" />
        <Stat value={s.retention == null ? '—' : `${s.retention}%`} label="retention" accent="#1a6b8a" />
      </div>

      <TOCFLMasteryPanel vocab={vocab} progress={progress} />

      <CCCCMasteryPanel vocab={vocab} progress={progress} />

      <FilterCard
        filter={filter}
        toggleTocflBand={toggleTocflBand}
        vocab={vocab}
        progress={progress}
        filteredVocab={filteredVocab}
        dangdaiFilter={dangdaiFilter}
        setDangdaiFilter={setDangdaiFilter}
        onStart={onStart}
      />
    </div>
  )
}
