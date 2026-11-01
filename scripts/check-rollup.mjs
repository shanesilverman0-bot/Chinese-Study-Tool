// Usage: node scripts/check-rollup.mjs
// Synthetic check of rollupAttempts (DESIGN §11.4) and its interaction with mergeProgress (§7).

import { rollupAttempts } from '../src/lib/context.js'
import { mergeProgress } from '../src/lib/merge.js'

const NOW = new Date('2026-11-01T00:00:00.000Z')
const DAY = 86400000
let failed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` ${detail}`}`)
  if (!ok) failed++
}

const TYPES = ['cloze', 'fill', 'usage', 'listening']
const attempts = []
for (let i = 0; i < 3600; i++) {
  attempts.push({
    id: `a${i}`, at: new Date(NOW.getTime() - 120 * DAY + (i * 120 * DAY) / 3600).toISOString(),
    fileId: `f${i % 7}`, exId: `e${i % 13}`, q: 0, key: `k${i % 40}|p`, type: TYPES[i % 4],
    mode: 'practice', runId: null, correct: i % 3 !== 0, chosen: 'x', ms: 1000,
  })
}
const p0 = { studySettings: { attemptLogMax: 3000 }, attempts, contextArchive: { watermark: null, items: {} } }
const p1 = rollupAttempts(structuredClone(p0), NOW)

const cutoff = NOW.getTime() - 60 * DAY
check('length <= 3000 or all remaining < 60 days old',
  p1.attempts.length <= 3000 || p1.attempts.every((a) => new Date(a.at).getTime() >= cutoff), `len=${p1.attempts.length}`)
check('rolled up something', p1.attempts.length < 3600)

const totals = (p) => {
  const t = {}
  for (const [k, it] of Object.entries(p.contextArchive.items)) t[k] = { n: it.n, c: it.c }
  for (const a of p.attempts) {
    const x = (t[a.key] ??= { n: 0, c: 0 })
    x.n++
    if (a.correct) x.c++
  }
  return t
}
const orig = {}
for (const a of attempts) {
  const x = (orig[a.key] ??= { n: 0, c: 0 })
  x.n++
  if (a.correct) x.c++
}
const got = totals(p1)
check('per-key n and c preserved',
  Object.keys(orig).length === Object.keys(got).length && Object.keys(orig).every((k) => got[k]?.n === orig[k].n && got[k]?.c === orig[k].c))
const typeSum = Object.values(p1.contextArchive.items).every((it) =>
  Object.values(it.byType).reduce((s, v) => s + v[0], 0) === it.n && Object.values(it.byType).reduce((s, v) => s + v[1], 0) === it.c)
check('byType sums match n and c', typeSum)
check('exCorrect <= 10 distinct', Object.values(p1.contextArchive.items).every((it) => it.exCorrect.length <= 10 && new Set(it.exCorrect).size === it.exCorrect.length))
const newestFolded = attempts.filter((a) => !p1.attempts.some((r) => r.id === a.id)).map((a) => a.at).sort().at(-1)
check('watermark = newest archived at', p1.contextArchive.watermark === newestFolded)
check('no raw attempt at or before watermark', p1.attempts.every((a) => a.at > p1.contextArchive.watermark))

// Merge with a device that still has all the raw attempts: no double counting.
const stale = { ...structuredClone(p0), schemaVersion: 3 }
const rolled = { ...p1, schemaVersion: 3 }
for (const [name, m] of [['rolled+stale', mergeProgress(rolled, stale)], ['stale+rolled', mergeProgress(stale, rolled)]]) {
  const g = totals(m)
  check(`merge ${name}: no double counting`, Object.keys(orig).every((k) => g[k]?.n === orig[k].n && g[k]?.c === orig[k].c))
}

// Idempotent, and a no-op under the max.
const again = rollupAttempts(structuredClone(p1), NOW)
check('rollup is idempotent', again.attempts.length === p1.attempts.length && again.contextArchive.watermark === p1.contextArchive.watermark)
check('no-op under the max', rollupAttempts({ ...p0, attempts: attempts.slice(0, 100) }, NOW).attempts.length === 100)

// Nothing older than 60 days: allowed to exceed the max.
const fresh = attempts.map((a, i) => ({ ...a, at: new Date(NOW.getTime() - (i % 50) * DAY).toISOString() }))
check('recent attempts are never archived', rollupAttempts({ ...p0, attempts: fresh }, NOW).attempts.length === 3600)

console.log(failed ? `\n${failed} check(s) failed` : '\nPASS')
process.exit(failed ? 1 : 0)
