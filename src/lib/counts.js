// Counting engine (DESIGN §8). Pure: no React, no Vite, no browser APIs, so
// scripts/check-counts.mjs can import it under Node.

import { THRESHOLD_EDGES, DEFAULT_STUDY_SETTINGS } from './schema.js'
import { localDate } from './dates.js'

export { THRESHOLD_EDGES }

const REVIEW_STATE = 2

// A hand-edited threshold that isn't an edge uses the largest edge ≤ the value
// (the smallest edge if the value is below all of them).
export function normalizeThreshold(t) {
  const n = Number(t)
  if (!Number.isFinite(n)) return DEFAULT_STUDY_SETTINGS.knownThreshold
  let best = THRESHOLD_EDGES[0]
  for (const e of THRESHOLD_EDGES) if (e <= n) best = e
  return best
}

// Fills missing counting fields from the defaults; never mutates the input.
export function countingSettings(s) {
  const d = DEFAULT_STUDY_SETTINGS
  const b = s?.baseline ?? {}
  return {
    ...(s ?? {}),
    knownThreshold: normalizeThreshold(s?.knownThreshold ?? d.knownThreshold),
    knownRequiresReviewState: s?.knownRequiresReviewState ?? d.knownRequiresReviewState,
    baseline: {
      enabled: b.enabled ?? d.baseline.enabled,
      solidThrough: b.solidThrough ?? d.baseline.solidThrough,
      studiedThrough: b.studiedThrough ?? d.baseline.studiedThrough,
    },
    contextRule: s?.contextRule ?? d.contextRule,
    timeZone: s?.timeZone ?? d.timeZone,
  }
}

// DESIGN §8.3: reps > 0, stability above the threshold, and (optionally) graduated.
export function isKnownCard(card, settings) {
  const s = countingSettings(settings)
  if (!card || !(card.reps > 0)) return false
  if (!(card.stability > s.knownThreshold)) return false
  return !s.knownRequiresReviewState || card.state === REVIEW_STATE
}

const seenAt = (c) => c.firstSeen ?? c.last_review ?? null

// DESIGN §8.1: Map(tocflKey → { card, firstSeen }). The card is the one with the
// highest stability among the key's own card and every alias card (CCC/Pleco/custom
// items that map to it); firstSeen is the earliest among them. Keys with no reviewed
// card (reps > 0) are absent.
export function effectiveCards(progress, index) {
  const cards = progress?.cards ?? {}
  const out = new Map()
  for (const tk of index.tocflKeys) {
    let best = null
    let first = null
    for (const k of [tk, ...index.aliasesOf(tk)]) {
      const c = cards[k]
      if (!c || !(c.reps > 0)) continue
      if (!best || (c.stability ?? 0) > (best.stability ?? 0)) best = c
      const f = seenAt(c)
      if (f && (!first || f < first)) first = f
    }
    if (best) out.set(tk, { card: best, firstSeen: first })
  }
  return out
}

// { seen, known, context, raw } under `settings` (raw as DESIGN §5.6).
// baseline = { solid: Set, studied: Set } from baselineSets(); contextQualified(key) → bool.
export function computeCounts({ progress, index, settings, baseline, contextQualified = () => false, eff }) {
  const s = countingSettings(settings)
  const T = s.knownThreshold
  const cards = eff ?? effectiveCards(progress, index)
  const solid = baseline?.solid ?? new Set()
  const studied = baseline?.studied ?? new Set()

  const tails = {}
  const tailsReviewState = {}
  for (const e of THRESHOLD_EDGES) { tails[e] = 0; tailsReviewState[e] = 0 }
  let known = 0
  for (const { card } of cards.values()) {
    const st = card.stability ?? 0
    for (const e of THRESHOLD_EDGES) {
      if (st > e) {
        tails[e]++
        if (card.state === REVIEW_STATE) tailsReviewState[e]++
      }
    }
    if (isKnownCard(card, s)) known++
  }

  let baselineUntouched = 0
  let studiedUntouched = 0
  for (const k of solid) if (!cards.has(k)) baselineUntouched++
  for (const k of studied) if (!cards.has(k)) studiedUntouched++

  let context = 0
  for (const k of index.tocflKeys) if (contextQualified(k)) context++

  const reviewedTocfl = cards.size
  return {
    seen: reviewedTocfl + baselineUntouched + studiedUntouched,
    known: known + baselineUntouched,
    context,
    raw: { reviewedTocfl, tails, tailsReviewState, baselineUntouched, studiedUntouched, contextQualified: context },
  }
}

export function contextRuleKey(settings) {
  const { approved, ...rest } = countingSettings(settings).contextRule // eslint-disable-line no-unused-vars
  return JSON.stringify(rest)
}

export function snapshotParams(settings) {
  const s = countingSettings(settings)
  return {
    knownThreshold: s.knownThreshold,
    knownRequiresReviewState: s.knownRequiresReviewState,
    baselineEnabled: s.baseline.enabled,
    solidThrough: s.baseline.solidThrough,
    studiedThrough: s.baseline.studiedThrough,
    contextRuleKey: contextRuleKey(s),
  }
}

export function buildSnapshot(date, counts, settings, source = 'live', now = new Date()) {
  return {
    date,
    computedAt: now.toISOString(),
    seen: counts.seen,
    known: counts.known,
    context: counts.context,
    params: snapshotParams(settings),
    raw: counts.raw,
    source,
  }
}

// New progress with `snap` replacing any snapshot of the same date (sorted by date).
export function upsertSnapshot(progress, snap) {
  const rest = (progress.snapshots ?? []).filter((x) => x.date !== snap.date)
  return { ...progress, snapshots: [...rest, snap].sort((a, b) => a.date.localeCompare(b.date)) }
}

// Same numbers and params as the stored snapshot (ignoring computedAt)? Used to skip no-op saves.
export function sameSnapshot(a, b) {
  if (!a || !b) return false
  const strip = ({ computedAt, ...rest }) => JSON.stringify(rest) // eslint-disable-line no-unused-vars
  return strip(a) === strip(b)
}

// DESIGN §8.5: rewrite seen/known/context/params of past snapshots with the current
// settings. Reviewed counts come from the stored raw.tails / raw.tailsReviewState (exact,
// since thresholds are edges); the baseline part is recomputed from each card's firstSeen:
// a baseline key is untouched on date d if it has no effective card or was first seen
// after d. Context keeps its stored value. Snapshots without raw.tails are left alone.
// `baseline` = { solid, studied } from baselineSets(). Returns { progress, changed }.
export function recomputeHistory({ progress, index, settings, baseline, now = new Date() }) {
  const s = countingSettings(settings)
  const tz = s.timeZone
  const eff = effectiveCards(progress, index)
  const solid = baseline?.solid ?? new Set()
  const studied = baseline?.studied ?? new Set()
  const firstDate = new Map()
  for (const [k, { firstSeen }] of eff) firstDate.set(k, firstSeen ? localDate(new Date(firstSeen), tz) : null)
  const untouchedAt = (set, date) => {
    let n = 0
    for (const k of set) {
      const fd = firstDate.get(k)
      if (fd === undefined || (fd !== null && fd > date)) n++
    }
    return n
  }
  let changed = 0
  const snapshots = (progress.snapshots ?? []).map((snap) => {
    const tails = snap.raw?.tails
    if (!tails) return snap
    const tail = (s.knownRequiresReviewState ? snap.raw.tailsReviewState : tails)?.[s.knownThreshold]
    if (tail == null) return snap
    const bu = untouchedAt(solid, snap.date)
    const su = untouchedAt(studied, snap.date)
    changed++
    return {
      ...snap,
      computedAt: now.toISOString(),
      seen: (snap.raw.reviewedTocfl ?? 0) + bu + su,
      known: tail + bu,
      params: snapshotParams(s),
      raw: { ...snap.raw, baselineUntouched: bu, studiedUntouched: su },
      source: 'recomputed',
    }
  })
  return { progress: { ...progress, snapshots }, changed }
}
