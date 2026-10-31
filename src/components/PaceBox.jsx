import React from 'react'
import { upcomingExams, examById, examLabel } from '../data/exams.js'
import { daysBetween } from '../lib/dates.js'
import { liveGoals, computePace, compareRows, compareColor } from '../lib/pace.js'

const fmt = (n) => Math.round(n).toLocaleString('en-US')

function registrationLine(exam, today) {
  if (!exam?.registration) return null
  const [from, to] = exam.registration
  if (today < from) return `Registration opens in ${daysBetween(today, from)} days`
  if (today <= to) return 'Registration open now'
  return 'Registration closed'
}

function Row({ label, children, color }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1">
      <span className="font-sans text-xs text-ink/60">{label}</span>
      <span className="text-right font-mono text-sm font-semibold" style={{ color }}>{children}</span>
    </div>
  )
}

export default function PaceBox({ goals, goal, snapshots, knownToday, today, compareExamIds = [], onChangeCompare, onSelectGoal, onUpdateGoal, onEditGoals }) {
  const enabled = liveGoals(goals).filter((g) => g.enabled)
  const pace = computePace({ goal, snapshots, knownToday, today })
  const exams = upcomingExams(today)
  // Keep the goal's current exam in the list even if its date is past; hide dates that
  // would end on or before the goal's start.
  const options = exams.filter((e) => !goal || e.date > goal.startDate || e.id === goal.examId)
  const current = goal?.examId ? examById(goal.examId) : null
  if (current && !options.some((e) => e.id === current.id)) options.unshift(current)

  const pickExam = (id) => {
    if (!goal) return
    const ex = examById(id)
    if (!ex) return
    onUpdateGoal(goal.id, { examId: ex.id, endDate: ex.date })
  }

  const rows = compareRows({ goal, examIds: compareExamIds, snapshots, knownToday, today })
  const toggleCompare = (id) => {
    const on = compareExamIds.includes(id)
    onChangeCompare?.(on ? compareExamIds.filter((x) => x !== id) : [...compareExamIds, id])
  }
  const yr = today.slice(0, 4)
  const short = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}${d.slice(0, 4) === yr ? '' : `/${d.slice(2, 4)}`}`

  let gapColor
  if (pace?.gap != null) gapColor = pace.gap > 0 ? '#c0392b' : '#2d6a4f'

  return (
    <div className="rounded-2xl border border-ink/10 bg-white/50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-sm font-bold tracking-wide text-ink/70">進度 · Pace</h3>
        <button onClick={onEditGoals} className="font-mono text-[11px] text-ink/50 underline">Goals ✎</button>
      </div>

      {!goal ? (
        <p className="font-sans text-xs text-ink/50">No enabled goal. Turn one on under the chart.</p>
      ) : (
        <>
          {enabled.length > 1 && (
            <select
              value={goal.id}
              onChange={(e) => onSelectGoal(e.target.value)}
              className="mb-2 w-full rounded-lg border border-ink/15 bg-paper px-2 py-1.5 font-sans text-sm"
            >
              {enabled.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          )}
          <select
            value={goal.examId && options.some((e) => e.id === goal.examId) ? goal.examId : ''}
            onChange={(e) => pickExam(e.target.value)}
            className="w-full rounded-lg border border-ink/15 bg-paper px-2 py-1.5 font-sans text-sm"
          >
            {!(goal.examId && options.some((e) => e.id === goal.examId)) && <option value="" disabled>Custom date {goal.endDate}</option>}
            {options.map((e) => <option key={e.id} value={e.id}>{examLabel(e)}</option>)}
          </select>
          <p className="mb-2 mt-1 font-mono text-[10px] text-ink/45">
            {registrationLine(current, today) ?? ''}
          </p>

          <Row label="Known today">{fmt(knownToday)}</Row>
          <Row label={`Target by ${pace.end}`}>{fmt(goal.target)}</Row>
          <Row label="Needed / week">{fmt(pace.needed)}</Row>
          <Row label={pace.basis ? `Actual / week (based on ${pace.basis} days)` : 'Actual / week (last 4 wks)'}>
            {pace.actual == null ? '—' : fmt(pace.actual)}
          </Row>
          <Row label="Gap" color={gapColor}>
            {pace.gap == null ? '—' : `${pace.gap > 0 ? '+' : ''}${fmt(pace.gap)}`}
          </Row>
          <p className="mt-1 font-mono text-[10px] text-ink/40">{pace.daysLeft} days left</p>

          {exams.length > 0 && (
            <div className="mt-3 border-t border-ink/10 pt-3">
              <p className="mb-1 font-sans text-xs text-ink/60">Compare exams</p>
              {exams.map((e) => (
                <label key={e.id} className="flex cursor-pointer items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    checked={compareExamIds.includes(e.id)}
                    onChange={() => toggleCompare(e.id)}
                    className="h-4 w-4 shrink-0 cursor-pointer"
                  />
                  <span className="min-w-0 flex-1 font-mono text-xs text-ink/80">
                    {e.date}
                    {e.id === goal.examId && <span className="text-ink/40"> · main</span>}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-ink/45">
                    {registrationLine(e, today)?.replace('Registration ', 'reg. ')}
                  </span>
                </label>
              ))}
              {rows.length > 0 && (
                <table className="mt-2 w-full table-fixed border-collapse font-mono text-[11px]">
                  <thead>
                    <tr className="text-left text-[10px] text-ink/45">
                      <th className="w-[26%] py-1 font-normal">Exam</th>
                      <th className="w-[16%] py-1 text-right font-normal">Wks</th>
                      <th className="w-[30%] py-1 text-right font-normal">Need/wk</th>
                      <th className="w-[28%] py-1 text-right font-normal">Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className={r.isMain ? 'font-semibold' : ''}>
                        <td className="py-0.5" style={{ color: r.isMain ? undefined : compareColor(compareExamIds, r.id) }}>{short(r.exam.date)}</td>
                        <td className="py-0.5 text-right">{r.weeks.toFixed(1)}</td>
                        <td className="py-0.5 text-right">{fmt(r.needed)}</td>
                        <td className="py-0.5 text-right" style={{ color: r.gap == null ? undefined : r.gap > 0 ? '#c0392b' : '#2d6a4f' }}>
                          {r.gap == null ? '—' : `${r.gap > 0 ? '+' : ''}${fmt(r.gap)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
