// Study session timer + hours-per-week rollup (DESIGN §13). The active session
// lives in localStorage so a reload resumes it; elapsed time always comes from
// `start`, never from ticks (a locked phone stops the ticks, not the clock).

import { storageKey } from './dataMode.js'
import { newId } from './ids.js'
import { localDate, addDays, weekStartMonday } from './dates.js'

export const STALE_SESSION_MS = 12 * 3600 * 1000

export function loadActive() {
  try {
    const a = JSON.parse(localStorage.getItem(storageKey('activeSession')) || 'null')
    if (!a || typeof a.start !== 'string') return null
    return {
      id: a.id,
      start: a.start,
      activities: Array.isArray(a.activities) ? a.activities : [],
      listIds: Array.isArray(a.listIds) ? a.listIds : [],
      counts: { reviews: a.counts?.reviews ?? 0, attempts: a.counts?.attempts ?? 0 },
      lastActivity: a.lastActivity ?? a.start,
    }
  } catch {
    return null
  }
}

export function saveActive(a) {
  try {
    if (a) localStorage.setItem(storageKey('activeSession'), JSON.stringify(a))
    else localStorage.removeItem(storageKey('activeSession'))
  } catch { /* private mode */ }
}

export function startSession(now = new Date()) {
  const iso = now.toISOString()
  const a = { id: newId('ses'), start: iso, activities: [], listIds: [], counts: { reviews: 0, attempts: 0 }, lastActivity: iso }
  saveActive(a)
  return a
}

// kind: 'review' | 'attempt'. A no-op when no session is running.
export function noteActivity(activity, listIds = [], kind = 'review') {
  const a = loadActive()
  if (!a) return
  const activities = a.activities.includes(activity) ? a.activities : [...a.activities, activity]
  const ids = [...a.listIds]
  for (const id of listIds) if (!ids.includes(id)) ids.push(id)
  const counts = { ...a.counts }
  if (kind === 'attempt') counts.attempts += 1
  else counts.reviews += 1
  saveActive({ ...a, activities, listIds: ids, counts, lastActivity: new Date().toISOString() })
}

// Ends the stored session at `at` (Date or ISO; default now) and returns the StudySession,
// or null if none is running. `at` is clamped to be no earlier than start.
export function endSession(at = new Date()) {
  const a = loadActive()
  if (!a) return null
  const startMs = Date.parse(a.start)
  const endMs = Math.max(startMs, at instanceof Date ? at.getTime() : Date.parse(at))
  saveActive(null)
  return {
    id: a.id,
    start: a.start,
    end: new Date(endMs).toISOString(),
    durationSec: Math.round((endMs - startMs) / 1000),
    activities: a.activities,
    listIds: a.listIds,
    counts: a.counts,
    source: 'timer',
    updatedAt: new Date().toISOString(),
  }
}

export function discardSession() {
  saveActive(null)
}

// Last 8 weeks (Mon–Sun, local zone), oldest first. A session belongs to its start date's week.
export function hoursByWeek(sessions, manualEntries, tz = 'Asia/Taipei', weeks = 8, now = new Date()) {
  const thisWeek = weekStartMonday(localDate(now, tz))
  const rows = []
  for (let i = weeks - 1; i >= 0; i--) rows.push({ weekStart: addDays(thisWeek, -7 * i), timerH: 0, manualH: 0 })
  const byWeek = new Map(rows.map((r) => [r.weekStart, r]))
  for (const s of sessions ?? []) {
    if (!s || s.deleted) continue
    const r = byWeek.get(weekStartMonday(localDate(new Date(s.start), tz)))
    if (r) r.timerH += (s.durationSec || 0) / 3600
  }
  for (const e of manualEntries ?? []) {
    if (!e || e.deleted || !e.date) continue
    const r = byWeek.get(weekStartMonday(e.date))
    if (r) r.manualH += (e.durationMin || 0) / 60
  }
  return rows
}
