// Usage: node scripts/check-merge.mjs <input.json>
// Builds two simulated devices from a migrated copy of progress.json, merges
// them and checks the DESIGN §7 invariants. Exit 1 on any FAIL.

import { readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { migrate, isStub } from '../src/lib/migrate.js'
import { mergeProgress } from '../src/lib/merge.js'

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/check-merge.mjs <input.json>')
  process.exit(1)
}

const raw = JSON.parse(readFileSync(file, 'utf8'))
const NOW = '2026-10-29T00:00:00.000Z'
const base = migrate(structuredClone(raw), { now: NOW, device: 'check-merge' })

const T1 = '2026-11-01T10:00:00.000Z'
const T2 = '2026-11-01T10:00:05.000Z'
const KA = '遺憾|yíhàn'
const KB = '完整|wánzhěng'

function rate(p, key, at) {
  const c = p.cards[key] ?? { hanzi: key.split('|')[0], pinyin: key.split('|')[1], reps: 0, lapses: 0, firstSeen: null }
  p.cards[key] = { ...c, reps: (c.reps ?? 0) + 1, last_review: at, firstSeen: c.firstSeen ?? at }
  p.log.push({ key, hanzi: c.hanzi, pinyin: c.pinyin, rating: 'good', at })
}

const A = structuredClone(base)
const B = structuredClone(base)

// 6,000 synthetic log entries on A, all older than T1.
for (let i = 0; i < 6000; i++) {
  A.log.push({
    key: `合成${i % 50}|hécheng`, hanzi: `合成${i % 50}`, pinyin: 'hécheng', rating: 'good',
    at: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString(),
  })
}
A.log.sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0))
const logBefore = A.log.length
rate(A, KA, T1)
rate(B, KB, T2)
A.snapshots.push({ date: '2026-11-01', computedAt: '2026-11-01T11:00:00.000Z', seen: 1, known: 1, context: 0 })
B.snapshots.push({ date: '2026-11-01', computedAt: '2026-11-01T12:00:00.000Z', seen: 2, known: 2, context: 0 })
A.sessions.push({ id: 'sA', updatedAt: T1 })
B.sessions.push({ id: 'sB', updatedAt: T2 })
const goalB = B.goals.find((g) => g.id === 'goal-jun-2027')
goalB.deleted = true
goalB.updatedAt = '2026-11-01T09:00:00.000Z'

const Aorig = structuredClone(A)
const Borig = structuredClone(B)
const M = mergeProgress(A, B)
const M2 = mergeProgress(B, A)

const loggedOf = (p) => new Set(p.log.map((e) => e.key))
const nonStub = (p) => Object.entries(p.cards).filter(([k, c]) => !isStub(c, k, loggedOf(p))).map(([k]) => k)
const count = (p, id) => p.log.filter((e) => `${e.key}|${e.at}` === id).length
const sessionIds = (p) => new Set(p.sessions.map((s) => s.id))

// Old app version: the pre-migration file (stubs present) merged with A.
const legacyMerged = mergeProgress(A, structuredClone(raw))

// Watermark: entries at/below it are dropped.
const WM = '2026-01-02T00:00:00.000Z'
const W = structuredClone(A)
W.logArchive = { watermark: WM, months: ['2026-01'] }
const MW = mergeProgress(W, B)

const results = [
  ['both card updates present', M.cards[KA]?.last_review === T1 && M.cards[KB]?.last_review === T2],
  ['both sessions present', sessionIds(M).has('sA') && sessionIds(M).has('sB')],
  ['later snapshot wins', M.snapshots.length === 1 && M.snapshots[0].computedAt === '2026-11-01T12:00:00.000Z'],
  ['goal tombstoned', M.goals.find((g) => g.id === 'goal-jun-2027')?.deleted === true && M.goals.length === base.goals.length],
  ['log not truncated (>6,000 kept)', M.log.length === logBefore + 2 && M.log.length > 6000],
  ['both new log entries exactly once', count(M, `${KA}|${T1}`) === 1 && count(M, `${KB}|${T2}`) === 1],
  ['log sorted by at', M.log.every((e, i, a) => i === 0 || a[i - 1].at <= e.at)],
  ['merge is symmetric (cards, log, sessions)', isDeepStrictEqual(M.cards, M2.cards) && isDeepStrictEqual(M.log, M2.log) && isDeepStrictEqual(sessionIds(M), sessionIds(M2))],
  ['merge(A, A) deep-equals A', isDeepStrictEqual(mergeProgress(A, A), A)],
  ['inputs not mutated', isDeepStrictEqual(A, Aorig) && isDeepStrictEqual(B, Borig)],
  ['no non-stub card lost', nonStub(A).every((k) => k in M.cards) && nonStub(B).every((k) => k in M.cards)],
  ['no top-level key lost', [...Object.keys(A), ...Object.keys(B)].every((k) => k in M)],
  ['old-app merge: no stubs', Object.entries(legacyMerged.cards).every(([k, c]) => !isStub(c, k, loggedOf(legacyMerged)))],
  [
    'old-app merge: every reviewed card kept',
    Object.entries(raw.cards).filter(([, c]) => c.reps > 0).every(([k]) => k in legacyMerged.cards) &&
      Object.keys(A.cards).every((k) => k in legacyMerged.cards),
  ],
  ['log drops entries <= watermark', MW.log.length > 0 && MW.log.every((e) => e.at > WM) && MW.logArchive.watermark === WM],
]

let failed = 0
for (const [name, ok] of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failed++
}
console.log(failed ? `${failed} FAILED` : 'ALL PASS')
process.exit(failed ? 1 : 0)
