// Context exercises: question refs, practice picking, attempt log, per-word stats, Context rule,
// gap list (DESIGN §5.11–5.12, §11.2, §11.5–11.6).

import { DEFAULT_STUDY_SETTINGS } from './schema.js'
import { effectiveCards, isKnownCard } from './counts.js'

export const questionRef = (fileId, exId, q) => `${fileId}#${exId}#${q}`

// files: [{ meta, json }] → [{ ref, fileId, exId, q, type, key }]. Disabled questions are skipped.
export function questionRefs(files, flags = {}) {
  const out = []
  for (const { meta, json } of files) {
    for (const ex of json?.exercises ?? []) {
      ;(ex.questions ?? []).forEach((qu, q) => {
        const ref = questionRef(meta.id, ex.id, q)
        if (flags?.[ref]?.status === 'disabled') return
        out.push({ ref, fileId: meta.id, exId: ex.id, q, type: ex.type, key: qu.target ?? ex.targets?.[0] ?? '' })
      })
    }
  }
  return out
}

function shuffle(a) {
  const x = [...a]
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[x[i], x[j]] = [x[j], x[i]]
  }
  return x
}

// types: array of exercise types, or null/empty for all. count: number or null (all).
// Order (DESIGN §11.2): gap-list keys first (`gapKeys`, in gap order), then fewest attempts on the
// target item, ties random.
export function pickPracticeQuestions({ refs, progress, types, count = 20, gapKeys = [] }) {
  const n = new Map()
  for (const a of progress?.attempts ?? []) n.set(a.key, (n.get(a.key) ?? 0) + 1)
  const gapRank = new Map(gapKeys.map((k, i) => [k, i]))
  const pool = types?.length ? refs.filter((r) => types.includes(r.type)) : refs
  const rank = (r) => gapRank.get(r.key) ?? Infinity
  const sorted = shuffle(pool).sort((a, b) => {
    const ra = rank(a), rb = rank(b)
    if (ra !== rb) return ra < rb ? -1 : 1
    return (n.get(a.key) ?? 0) - (n.get(b.key) ?? 0)
  })
  return count == null ? sorted : sorted.slice(0, count)
}

export function recordAttempt(progress, attempt) {
  return { ...progress, attempts: [...(progress.attempts ?? []), attempt] }
}

const DAY = 86400000
const ROLLUP_KEEP_DAYS = 60
const ROLLUP_HEADROOM = 500

// DESIGN §11.4. Pure. When attempts exceed attemptLogMax, fold attempts older than 60 days
// (oldest first) into contextArchive until length <= max - 500 or none that old remain.
export function rollupAttempts(progress, now = new Date()) {
  const attempts = progress?.attempts ?? []
  const max = progress?.studySettings?.attemptLogMax ?? 3000
  if (attempts.length <= max) return progress
  const cutoff = new Date(now).getTime() - ROLLUP_KEEP_DAYS * DAY
  const sorted = [...attempts].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  const target = max - ROLLUP_HEADROOM
  let n = 0
  while (n < sorted.length && sorted.length - n > target && new Date(sorted[n].at).getTime() < cutoff) n++
  if (n === 0) return progress
  // The watermark drops everything at or before it, so never split a run of equal timestamps.
  while (n < sorted.length && sorted[n].at === sorted[n - 1].at) n++
  const folded = sorted.slice(0, n)

  const prev = progress.contextArchive ?? { watermark: null, items: {} }
  const items = { ...prev.items }
  for (const a of folded) {
    const it = items[a.key] = items[a.key] ? cloneItem(items[a.key]) : { n: 0, c: 0, byType: {}, exCorrect: [] }
    it.n++
    const bt = it.byType[a.type] ?? (it.byType[a.type] = [0, 0])
    bt[0]++
    if (a.correct) {
      it.c++
      bt[1]++
      const ex = `${a.fileId}#${a.exId}`
      if (it.exCorrect.length < 10 && !it.exCorrect.includes(ex)) it.exCorrect.push(ex)
    }
  }
  return {
    ...progress,
    attempts: sorted.slice(n),
    contextArchive: { watermark: folded[folded.length - 1].at, items },
  }
}

function cloneItem(it) {
  return {
    n: it.n, c: it.c,
    byType: Object.fromEntries(Object.entries(it.byType ?? {}).map(([t, v]) => [t, [...v]])),
    exCorrect: [...(it.exCorrect ?? [])],
  }
}

// ---- Per-word stats, Context rule, understanding, gap list (DESIGN §11.5–11.6) ----

const DECAY = 0.8

export function contextRuleOf(settings) {
  return { ...DEFAULT_STUDY_SETTINGS.contextRule, ...(settings?.contextRule ?? {}) }
}

export function understandingOf(settings) {
  const d = DEFAULT_STUDY_SETTINGS.understanding
  const u = settings?.understanding ?? {}
  return { max: u.max ?? d.max, points: { ...d.points, ...(u.points ?? {}) } }
}

// key → raw attempts (oldest first). Build once per progress when scoring many keys.
export function groupAttempts(progress) {
  const by = new Map()
  const sorted = [...(progress?.attempts ?? [])].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  for (const a of sorted) {
    const l = by.get(a.key)
    if (l) l.push(a)
    else by.set(a.key, [a])
  }
  return by
}

// Graded, natural sentences per key (for sentenceNaturalBonus).
function naturalSentenceCount(progress, key) {
  let n = 0
  for (const e of progress?.sentences ?? []) if (!e.deleted && e.key === key && e.grade?.natural) n++
  return n
}

// archive + raw attempts for one word. `group` = groupAttempts(progress), optional.
export function contextStats(key, progress, settings, group) {
  const rule = contextRuleOf(settings)
  const { max, points } = understandingOf(settings)
  const sentencesOn = !!rule.sentencesCount
  const R = Math.max(1, Math.floor(rule.recentWindow) || 1)
  const arch = progress?.contextArchive?.items?.[key]
  const raw = ((group ?? groupAttempts(progress)).get(key) ?? []).filter((a) => sentencesOn || a.type !== 'sentence')

  const byType = {}
  let n = 0
  let c = 0
  const exCorrect = new Set()
  let archN = 0
  let archC = 0
  for (const [t, v] of Object.entries(arch?.byType ?? {})) {
    if (t === 'sentence' && !sentencesOn) continue
    byType[t] = [v[0], v[1]]
    archN += v[0]
    archC += v[1]
  }
  for (const e of arch?.exCorrect ?? []) if (sentencesOn || !e.startsWith('sentences#')) exCorrect.add(e)
  n += archN
  c += archC
  for (const a of raw) {
    const bt = byType[a.type] ?? (byType[a.type] = [0, 0])
    bt[0]++
    n++
    if (a.correct) {
      bt[1]++
      c++
      exCorrect.add(`${a.fileId}#${a.exId}`)
    }
  }

  // Weighted accuracy over the last R attempts (newest weight 1, then 0.8, 0.64, ...). Missing
  // slots are filled with the archive's overall accuracy when it holds older attempts.
  const recent = raw.slice(-R).reverse()
  let wAll = 0
  let wOk = 0
  recent.forEach((a, i) => {
    const w = DECAY ** i
    wAll += w
    if (a.correct) wOk += w
  })
  if (recent.length < R && archN > 0) {
    const fill = Math.min(R - recent.length, archN)
    for (let i = recent.length; i < recent.length + fill; i++) {
      const w = DECAY ** i
      wAll += w
      wOk += w * (archC / archN)
    }
  }
  const recentAcc = wAll ? wOk / wAll : 0

  let typesCorrect = 0
  let understanding = 0
  for (const [t, v] of Object.entries(byType)) {
    if (v[1] > 0) typesCorrect++
    understanding += (points[t] ?? 1) * v[1]
  }
  if (sentencesOn) understanding += (points.sentenceNaturalBonus ?? 0) * naturalSentenceCount(progress, key)

  const lastRaw = raw.length ? raw[raw.length - 1].at : null
  return {
    n, c, byType,
    distinctCorrect: exCorrect.size,
    typesCorrect,
    recentAcc,
    understanding: Math.min(max, understanding),
    max,
    lastAt: lastRaw,
  }
}

export function contextQualified(key, progress, rule, group) {
  const r = { ...DEFAULT_STUDY_SETTINGS.contextRule, ...(rule ?? {}) }
  const st = contextStats(key, progress, { contextRule: r }, group)
  return st.c >= r.minCorrect
    && st.distinctCorrect >= r.minDistinctExercises
    && (!r.requireDistinctTypes || st.typesCorrect >= 2)
    && st.recentAcc >= r.minRecentAccuracy
}

// A closure for computeCounts: groups attempts once, then answers per key.
export function makeContextQualified(progress, settings) {
  const group = groupAttempts(progress)
  const rule = contextRuleOf(settings)
  const archived = progress?.contextArchive?.items ?? {}
  // Most of the ~7,500 TOCFL keys have no attempts at all: skip them without building stats.
  return (key) => (group.has(key) || key in archived) && contextQualified(key, progress, rule, group)
}

// DESIGN §11.6. Known words with no attempts, or n >= 2 and recentAcc < 0.6. Sorted by
// stability x (1 - recentAcc) descending (untested use recentAcc 0.5).
// → [{ key, stability, n, recentAcc, understanding, score }]
export function gapList(progress, index, settings, eff) {
  const group = groupAttempts(progress)
  const out = []
  for (const [key, { card }] of eff ?? effectiveCards(progress, index)) {
    if (!isKnownCard(card, settings)) continue
    const st = contextStats(key, progress, settings, group)
    if (!(st.n === 0 || (st.n >= 2 && st.recentAcc < 0.6))) continue
    const acc = st.n === 0 ? 0.5 : st.recentAcc
    out.push({ key, stability: card.stability ?? 0, n: st.n, recentAcc: acc, understanding: st.understanding, max: st.max, score: (card.stability ?? 0) * (1 - acc) })
  }
  return out.sort((a, b) => b.score - a.score)
}
