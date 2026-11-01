// Goal lines and pace (DESIGN §8.6). Pure.

import { daysBetween } from './dates.js'
import { goalEndDate, examById } from '../data/exams.js'

export const dateT = (ymd) => Date.parse(`${ymd}T00:00:00Z`)

export const liveGoals = (goals) => (goals ?? []).filter((g) => !g.deleted)

// Known on `date`: the latest snapshot on or before it; if the date precedes the
// first snapshot, the first snapshot's Known; with no snapshots, the live value.
export function knownOn(snapshots, date, fallback) {
  if (!snapshots?.length) return fallback
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
  let hit = null
  for (const s of sorted) if (s.date <= date) hit = s
  return (hit ?? sorted[0]).known
}

export function goalStartValue(goal, snapshots, knownToday) {
  return goal.startValue ?? knownOn(snapshots, goal.startDate, knownToday)
}

// Enabled goal chosen by selectedGoalId, else the enabled goal with the nearest future end date.
export function pickGoal(goals, selectedId, today) {
  const enabled = liveGoals(goals).filter((g) => g.enabled)
  const sel = enabled.find((g) => g.id === selectedId)
  if (sel) return sel
  const future = enabled
    .filter((g) => goalEndDate(g) >= today)
    .sort((a, b) => goalEndDate(a).localeCompare(goalEndDate(b)))
  return future[0] ?? enabled[0] ?? null
}

// Pace toward `goal.target` if the goal ended on `endDate`.
export function computePaceFor({ goal, endDate, snapshots, knownToday, today }) {
  if (!goal) return null
  const end = endDate
  const daysLeft = daysBetween(today, end)
  const needed = Math.max(0, goal.target - knownToday) / Math.max(1 / 7, daysLeft / 7)

  const past = [...(snapshots ?? [])].filter((s) => s.date <= today).sort((a, b) => a.date.localeCompare(b.date))
  let actual = null
  let basis = null
  if (past.length) {
    const cutoff = past.filter((s) => daysBetween(s.date, today) >= 28).pop()
    if (cutoff) {
      actual = (knownToday - cutoff.known) / 4
    } else {
      const span = daysBetween(past[0].date, today)
      if (span >= 3) {
        actual = (knownToday - past[0].known) / (span / 7)
        basis = span
      }
    }
  }
  const gap = actual == null ? null : needed - actual
  return { end, daysLeft, needed, actual, basis, gap }
}

export function computePace({ goal, snapshots, knownToday, today }) {
  if (!goal) return null
  return computePaceFor({ goal, endDate: goalEndDate(goal), snapshots, knownToday, today })
}

// One row per checked exam that is still upcoming (DESIGN §8.6), in checklist order.
// `isMain` marks the goal's own exam: the table lists it once, the chart draws it as the goal line.
export function compareRows({ goal, examIds, snapshots, knownToday, today }) {
  if (!goal) return []
  const rows = []
  for (const id of new Set(examIds ?? [])) {
    const exam = examById(id)
    if (!exam || exam.kind !== 'LR' || exam.date < today) continue
    const pace = computePaceFor({ goal, endDate: exam.date, snapshots, knownToday, today })
    rows.push({ id, exam, isMain: id === goal.examId, weeks: pace.daysLeft / 7, ...pace })
  }
  return rows.sort((a, b) => a.exam.date.localeCompare(b.exam.date))
}

// Fixed palette for the comparison lines; a color follows the exam's position in compareExamIds.
export const COMPARE_COLORS = ['#1a6b8a', '#7b4b94', '#c26a1b', '#2a9d8f', '#8a5a44']
export const compareColor = (ids, id) => COMPARE_COLORS[Math.max(0, ids.indexOf(id)) % COMPARE_COLORS.length]
