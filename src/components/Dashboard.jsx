import React, { useState, useMemo } from 'react'
import { BANDS, BAND_LABELS } from '../data/vocab.js'
import { isDue, State } from '../lib/fsrs.js'

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
  const bandVocab = vocab.filter((v) => v.source === 'tocfl' && v.band === band)
  const now = new Date()
  let mastered = 0
  let learned = 0
  let due = 0
  let unseen = 0
  for (const v of bandVocab) {
    const card = progress.cards[v.hanzi]
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
  toggleCcccList,
  vocab,
  progress,
  getFilteredVocab,
  onStart,
}) {
  const [activeTab, setActiveTab] = useState('tocfl')
  const now = new Date()

  const filteredVocab = getFilteredVocab()
  // New cards (reps === 0) are due from creation, so this also counts them as
  // actionable — matching buildQueue. Guard against cards not yet reconciled.
  const dueInFiltered = filteredVocab.filter((v) => {
    const card = progress.cards[v.hanzi]
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
          <div className="text-center py-6 text-ink/50">
            <p className="font-sans text-sm">
              Upload vocab packs via Settings → Vocab Packs
            </p>
          </div>
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

export default function Dashboard({
  progress,
  vocab,
  filter,
  toggleTocflBand,
  toggleCcccList,
  getFilteredVocab,
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

      <FilterCard
        filter={filter}
        toggleTocflBand={toggleTocflBand}
        toggleCcccList={toggleCcccList}
        vocab={vocab}
        progress={progress}
        getFilteredVocab={getFilteredVocab}
        onStart={onStart}
      />
    </div>
  )
}
