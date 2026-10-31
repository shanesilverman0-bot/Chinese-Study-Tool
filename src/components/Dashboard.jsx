import React, { useState } from 'react'
import { LEVELS } from '../data/vocab.js'
import { isDue, State } from '../lib/fsrs.js'
import StudyPicker from './StudyPicker.jsx'
import ProgressChart from './ProgressChart.jsx'
import PaceBox from './PaceBox.jsx'
import HoursChart from './HoursChart.jsx'
import GoalsEditor from './GoalsEditor.jsx'
import { pickGoal } from '../lib/pace.js'
import { useWide } from '../lib/layout.js'
import { DEFAULT_STUDY_SETTINGS } from '../lib/schema.js'

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




function TodayCard({ counts, baseline, settings, due }) {
  const b = settings?.baseline
  const sol = b?.solidThrough ?? { book: 3, chapter: 9 }
  const stu = b?.studiedThrough ?? { book: 4, chapter: 4 }
  const fmt = (n) => n.toLocaleString('en-US')
  const nums = [
    { label: 'Seen', value: counts.seen, accent: '#1a6b8a' },
    { label: 'Known', value: counts.known, accent: '#2d6a4f' },
    { label: 'Context', value: counts.context, accent: '#b8860b' },
  ]
  return (
    <div className="rounded-2xl border border-ink/10 bg-white/50 p-5">
      <h3 className="mb-3 font-display text-sm font-bold tracking-wide text-ink/70">今天 · Today</h3>
      <div className="grid grid-cols-3 gap-2">
        {nums.map((n) => (
          <div key={n.label} className="flex flex-col items-center">
            <span className="font-display text-3xl font-bold" style={{ color: n.accent }}>{fmt(n.value)}</span>
            <span className="mt-1 font-mono text-[10px] uppercase tracking-widest text-ink/45">{n.label}</span>
            {n.label === 'Context' && <span className="font-mono text-[10px] text-ink/30">(Phase 14)</span>}
          </div>
        ))}
      </div>
      {counts.byLevel && (
        <div className="mt-3 grid grid-cols-6 gap-1 border-t border-ink/10 pt-3">
          {LEVELS.map((l) => (
            <div key={l} className="flex flex-col items-center">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink/45">{l}</span>
              <span className="font-mono text-xs font-semibold text-ink/80">{fmt(counts.byLevel[l].known)}</span>
              <span className="font-mono text-[10px] text-ink/40">/{fmt(counts.byLevel[l].total)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 font-mono text-[11px] leading-relaxed text-ink/45">
        Due today: <span className="font-semibold text-cinnabar">{fmt(due)}</span>
      </p>
      <p className="mt-1 font-mono text-[11px] leading-relaxed text-ink/45">
        baseline: {fmt(baseline.solid.size)} solid (to B{sol.book} Ch {sol.chapter}) + {fmt(baseline.studied.size)} studied, unconfirmed (to B{stu.book} Ch {stu.chapter})
      </p>
    </div>
  )
}

export default function Dashboard({
  progress,
  counts,
  baseline,
  todayDate,
  updateGoals,
  updateStudySettings,
  vocab,
  pickerProps,
  onAddManual,
}) {
  const s = computeStats(progress, vocab)
  const wide = useWide()
  const [editing, setEditing] = useState(false)
  const goals = progress.goals ?? []
  const goal = pickGoal(goals, progress.studySettings?.selectedGoalId, todayDate)
  const compareExamIds = progress.studySettings?.compareExamIds ?? DEFAULT_STUDY_SETTINGS.compareExamIds

  const updateGoal = (id, patch) =>
    updateGoals((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch, updatedAt: new Date().toISOString() } : g)))

  return (
    <div className="brush-in mx-auto flex w-full flex-col gap-5">
      <TodayCard counts={counts} baseline={baseline} settings={progress.studySettings} due={s.due} />

      <div className={`grid gap-5 ${wide ? 'grid-cols-[1fr_320px] items-start' : ''}`}>
        <ProgressChart
          snapshots={progress.snapshots}
          today={todayDate}
          counts={counts}
          goals={goals}
          goal={goal}
          compareExamIds={compareExamIds}
        />
        {editing ? (
          <GoalsEditor goals={goals} onSave={(gs) => updateGoals(() => gs)} onClose={() => setEditing(false)} />
        ) : (
          <PaceBox
            goals={goals}
            goal={goal}
            snapshots={progress.snapshots}
            knownToday={counts.known}
            today={todayDate}
            compareExamIds={compareExamIds}
            onChangeCompare={(ids) => updateStudySettings({ compareExamIds: ids })}
            onSelectGoal={(id) => updateStudySettings({ selectedGoalId: id })}
            onUpdateGoal={updateGoal}
            onEditGoals={() => setEditing(true)}
          />
        )}
      </div>

      <div className={wide ? 'grid grid-cols-2 items-start gap-5' : 'flex flex-col gap-5'}>
      <HoursChart
        sessions={progress.sessions}
        manualEntries={progress.manualEntries}
        tz={progress.studySettings?.timeZone}
        onAddManual={onAddManual}
      />

      <div id="study-picker">
        <StudyPicker {...pickerProps} />
      </div>
      </div>

      <details className="rounded-2xl border border-ink/10 bg-white/30 p-4">
        <summary className="cursor-pointer font-display text-sm font-bold tracking-wide text-ink/70">
          詳細 · Details
        </summary>
        <div className="mt-4 flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3">
            <Stat value={s.due} label="due today" accent="#c0392b" />
            <Stat value={s.streak} label="day streak" accent="#b8860b" />
            <Stat value={s.learned} label="learned" accent="#2d6a4f" />
            <Stat value={s.retention == null ? '—' : `${s.retention}%`} label="retention" accent="#1a6b8a" />
          </div>
        </div>
      </details>
    </div>
  )
}
