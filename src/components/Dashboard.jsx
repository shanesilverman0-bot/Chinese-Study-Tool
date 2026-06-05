import React from 'react'
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

  // Per-band mastery, computed over the active vocab list.
  const byBand = {}
  for (const band of BANDS) {
    const ids = vocab.filter((v) => v.band === band).map((v) => v.id)
    const masteredCount = ids.filter(
      (id) => progress.cards[id]?.state === State.Review && progress.cards[id]?.stability >= 21
    ).length
    byBand[band] = { total: ids.length, mastered: masteredCount }
  }

  return { due, learned, mastered, retention, streak, byBand }
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

export default function Dashboard({ progress, vocab, onStart }) {
  const s = computeStats(progress, vocab)

  return (
    <div className="brush-in flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <Stat value={s.due} label="due today" accent="#c0392b" />
        <Stat value={s.streak} label="day streak" accent="#b8860b" />
        <Stat value={s.learned} label="learned" accent="#2d6a4f" />
        <Stat value={s.retention == null ? '—' : `${s.retention}%`} label="retention" accent="#1a6b8a" />
      </div>

      <div className="rounded-2xl border border-ink/10 bg-white/50 p-5">
        <h3 className="mb-3 font-display text-sm font-bold tracking-wide text-ink/70">
          TOCFL 等級進度 · Level mastery
        </h3>
        <div className="flex flex-col gap-3">
          {BANDS.map((band) => {
            const b = s.byBand[band]
            const pct = b.total ? Math.round((b.mastered / b.total) * 100) : 0
            return (
              <div key={band}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="font-sans text-sm text-ink/80">
                    {BAND_LABELS[band]}{' '}
                    <span className="font-mono text-xs text-ink/40">{band}</span>
                  </span>
                  <span className="font-mono text-xs text-ink/50">
                    {b.mastered}/{b.total}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-ink/10">
                  <div
                    className="h-full rounded-full bg-cinnabar transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <button
        onClick={onStart}
        className="rounded-2xl bg-cinnabar py-4 font-display text-lg font-bold text-paper transition hover:bg-seal"
      >
        {s.due > 0 ? `開始複習 · Review ${s.due} cards` : '自由練習 · Practice'}
      </button>
    </div>
  )
}
