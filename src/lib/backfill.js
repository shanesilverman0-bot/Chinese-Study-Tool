// FSRS log replay, snapshot backfill and course-history estimate (DESIGN §8.5).
// Pure: no React, no Vite, no browser APIs, so scripts/check-backfill.mjs can import it under Node.

import { createEmptyCard, fsrs } from 'ts-fsrs'
import { params, RATING } from './fsrs.js'
import { computeCounts, buildSnapshot, countingSettings, snapshotParams } from './counts.js'
import { THRESHOLD_EDGES } from './schema.js'
import { localDate, addDays, daysBetween } from './dates.js'

const scheduler = fsrs(params)
const cmpChapter = (a, b) => (a.book - b.book) || (a.chapter - b.chapter)
const dedupeSort = (log) => {
  const seen = new Set()
  const out = []
  for (const e of log ?? []) {
    const id = `${e.key}\u0000${e.at}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push(e)
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
}

// Map(key → [{ at, reps, stability, state }]), the card state after each review, in order.
// Each key starts from createEmptyCard(first review time).
export function replayLog(log) {
  const out = new Map()
  const cards = new Map()
  for (const e of dedupeSort(log)) {
    const rating = RATING[e.rating]
    if (rating === undefined) continue
    const at = new Date(e.at)
    let card = cards.get(e.key)
    if (!card) card = createEmptyCard(at)
    card = scheduler.next(card, at, rating).card
    cards.set(e.key, card)
    let list = out.get(e.key)
    if (!list) out.set(e.key, (list = []))
    list.push({ at: e.at, reps: card.reps, stability: card.stability, state: card.state })
  }
  return out
}

// Ordered unique chapters of the CCC entries: [{ book, chapter }].
export function chapterList(cccEntries) {
  const seen = new Set()
  const out = []
  for (const r of cccEntries) {
    if (r.book == null || r.chapter == null) continue
    const id = `${r.book}:${r.chapter}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ book: Number(r.book), chapter: Number(r.chapter) })
  }
  return out.sort(cmpChapter)
}

// Estimated completion date of each chapter (DESIGN §8.5): chapters before the start chapter
// are done on the start date; start..end chapters (inclusive) are spread evenly over the period.
// Returns [{ book, chapter, date }] or null when the history can't be used.
export function chapterDates(cccEntries, courseHistory) {
  if (!courseHistory?.start?.date || !courseHistory?.end?.date) return null
  const { start, end } = courseHistory
  const span = daysBetween(start.date, end.date)
  if (span < 0) return null
  const chapters = chapterList(cccEntries)
  const inCourse = chapters.filter((c) => cmpChapter(c, start) >= 0 && cmpChapter(c, end) <= 0)
  const n = inCourse.length
  return chapters
    .filter((c) => cmpChapter(c, end) <= 0)
    .map((c) => {
      if (cmpChapter(c, start) < 0) return { ...c, date: start.date }
      const i = inCourse.findIndex((x) => x.book === c.book && x.chapter === c.chapter)
      return { ...c, date: addDays(start.date, Math.round(((i + 1) / n) * span)) }
    })
}

// Baseline sets as the course would have had them on `date`: keys first met in chapters
// completed by then. solid = those at or before solidThrough, studied = the rest.
export function makeBaselineFor({ index, cccEntries, settings }) {
  const s = countingSettings(settings)
  const cd = settings?.courseHistory
  const dates = chapterDates(cccEntries, cd)
  const first = new Map()
  for (const row of cccEntries) {
    const { tocflKey } = index.rowInfo(row)
    if (!tocflKey || row.book == null || row.chapter == null) continue
    const cur = first.get(tocflKey)
    if (!cur || cmpChapter(row, cur) < 0) first.set(tocflKey, { book: Number(row.book), chapter: Number(row.chapter) })
  }
  const dateOf = new Map((dates ?? []).map((c) => [`${c.book}:${c.chapter}`, c.date]))
  const configured = (() => {
    const solid = new Set()
    const studied = new Set()
    if (s.baseline.enabled) {
      for (const [k, ch] of first) {
        if (cmpChapter(ch, s.baseline.solidThrough) <= 0) solid.add(k)
        else if (cmpChapter(ch, s.baseline.studiedThrough) <= 0) studied.add(k)
      }
    }
    return { solid, studied }
  })()
  const cache = new Map()
  return function baselineFor(date) {
    if (!dates || !s.baseline.enabled || date > cd.end.date) return configured
    if (cache.has(date)) return cache.get(date)
    const solid = new Set()
    const studied = new Set()
    for (const [k, ch] of first) {
      const done = dateOf.get(`${ch.book}:${ch.chapter}`)
      if (done == null || done > date) continue
      if (cmpChapter(ch, s.baseline.solidThrough) <= 0) solid.add(k)
      else studied.add(k)
    }
    const r = { solid, studied }
    cache.set(date, r)
    return r
  }
}

// Daily `backfill` snapshots from fromDate (default: first log date) to toDate (inclusive) for
// every local date with no existing snapshot. Stability at the end of day d = the last replayed
// state at or before d. Context = 0. Returns { snapshots, skippedKeys, firstDate }.
export function backfillSnapshots({ log, progress, index, settings, baselineFor, fromDate, toDate, now = new Date() }) {
  const s = countingSettings(settings)
  const tz = s.timeZone
  const replay = replayLog(log)
  const have = new Set((progress?.snapshots ?? []).map((x) => x.date))
  const cards = progress?.cards ?? {}

  const events = []
  let skippedKeys = 0
  for (const [key, states] of replay) {
    if (!cards[key]) { skippedKeys++; continue }
    for (const st of states) events.push({ key, ...st })
  }
  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  if (!events.length) return { snapshots: [], skippedKeys, firstDate: null }

  const firstDate = localDate(new Date(events[0].at), tz)
  const start = fromDate && fromDate > firstDate ? fromDate : firstDate
  const firstSeen = new Map()
  const current = {}
  const snapshots = []
  let i = 0
  for (let d = firstDate; toDate && d <= toDate; d = addDays(d, 1)) {
    while (i < events.length && localDate(new Date(events[i].at), tz) <= d) {
      const e = events[i++]
      if (!firstSeen.has(e.key)) firstSeen.set(e.key, e.at)
      current[e.key] = { reps: e.reps, stability: e.stability, state: e.state, firstSeen: firstSeen.get(e.key), last_review: e.at }
    }
    if (d < start || have.has(d)) continue
    const counts = computeCounts({
      progress: { cards: current }, index, settings: s, baseline: baselineFor(d), contextQualified: () => false,
    })
    snapshots.push(buildSnapshot(d, counts, s, 'backfill', now))
  }
  return { snapshots, skippedKeys, firstDate }
}

// Weekly `estimate` snapshots (DESIGN §8.5) from courseHistory.start.date to end.date, only on
// dates with no snapshot in `existing` (a Set of dates) and before `beforeDate` (exclusive; the
// first review-log date, from which the FSRS backfill takes over). [] when courseHistory is null.
export function estimateCourseHistory({ index, cccEntries, courseHistory, settings, existing = new Set(), beforeDate = null, now = new Date() }) {
  if (!courseHistory) return []
  const s = countingSettings(settings)
  if (!s.baseline.enabled) return []
  const baselineFor = makeBaselineFor({ index, cccEntries, settings: { ...settings, courseHistory } })
  const dates = []
  const { start, end } = courseHistory
  for (let d = start.date; d < end.date; d = addDays(d, 7)) dates.push(d)
  dates.push(end.date)
  const params_ = snapshotParams(s)
  const tails = Object.fromEntries(THRESHOLD_EDGES.map((e) => [e, 0]))
  const out = []
  for (const d of dates) {
    if (existing.has(d) || (beforeDate && d >= beforeDate)) continue
    const { solid, studied } = baselineFor(d)
    out.push({
      date: d,
      computedAt: now.toISOString(),
      seen: solid.size + studied.size,
      known: solid.size,
      context: 0,
      params: params_,
      raw: {
        reviewedTocfl: 0, tails: { ...tails }, tailsReviewState: { ...tails },
        baselineUntouched: solid.size, studiedUntouched: studied.size, contextQualified: 0,
      },
      source: 'estimate',
    })
  }
  return out
}

// Everything "Build history" would add right now: course estimates strictly before the first
// log date, then daily backfill snapshots from it to `toDate` (yesterday), both skipping dates
// that already have a snapshot. `log` should be the full log (archive + progress.log).
export function planHistory({ log, progress, index, cccEntries, settings, toDate, now = new Date() }) {
  const baselineFor = makeBaselineFor({ index, cccEntries, settings })
  const bf = backfillSnapshots({ log, progress, index, settings, baselineFor, toDate, now })
  const existing = new Set((progress?.snapshots ?? []).map((x) => x.date))
  const estimate = estimateCourseHistory({
    index, cccEntries, courseHistory: settings?.courseHistory ?? null, settings, existing, beforeDate: bf.firstDate, now,
  })
  return { estimate, backfill: bf.snapshots, skippedKeys: bf.skippedKeys }
}
