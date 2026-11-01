// Usage: node scripts/check-log-archive.mjs
// Phase 6: synthetic progress with 20,000 log entries over 300 days → planArchive (keepDays 90).
// Then archiveLog with an in-memory store, including a simulated failed write. No network.

import { planArchive, archiveLog, loadFullLog } from '../src/lib/logArchive.js'

const DAY = 86400000
const now = new Date('2026-10-31T06:00:00Z')
const log = []
for (let i = 0; i < 20000; i++) {
  const at = new Date(now.getTime() - 300 * DAY + Math.floor((i / 20000) * 300 * DAY) + (i % 977)).toISOString()
  log.push({ key: `w${i % 1500}|x`, hanzi: 'w', pinyin: 'x', rating: 'good', at })
}
const progress = {
  studySettings: { timeZone: 'Asia/Taipei', logKeepDays: 90 },
  log, logArchive: { watermark: null, months: [] },
}
const id = (e) => `${e.key}|${e.at}`
let failed = 0
const ok = (label, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failed++ }

const plan = planArchive(progress, now, 90)
const archived = Object.values(plan.months).flat()
const archivedIds = new Set(archived.map(id))
const kept = log.filter((e) => !archivedIds.has(id(e)))
console.log(`archived ${archived.length}, kept ${kept.length}, months ${Object.keys(plan.months).join(' ')}, watermark ${plan.newWatermark}`)
ok('archived + kept = original', archived.length + kept.length === log.length && new Set([...archived, ...kept].map(id)).size === log.length)
ok('no entry in both', kept.every((e) => !archivedIds.has(id(e))))
ok('kept entries all newer than the watermark', kept.every((e) => e.at > plan.newWatermark))
ok('archived entries all at or below the watermark', archived.every((e) => e.at <= plan.newWatermark))
ok('each month file sorted by at', Object.values(plan.months).every((l) => l.every((e, i) => i === 0 || l[i - 1].at <= e.at)))

// In-memory store standing in for the data repo.
const files = new Map()
const store = (failOn = null) => ({
  async read(m) { const f = files.get(m); return { entries: f?.entries ?? [], sha: f ? 'sha' : null } },
  async write(m, entries) {
    if (m === failOn) throw new Error(`simulated write failure for ${m}`)
    files.set(m, { entries })
  },
})

// Another device already wrote part of one month: union, never overwrite.
const m0 = Object.keys(plan.months)[1]
files.set(m0, { entries: [plan.months[m0][0], { key: 'other|x', hanzi: 'o', pinyin: 'x', rating: 'good', at: plan.months[m0][0].at.replace(/\d{3}Z$/, '999Z') }] })

const months = Object.keys(plan.months)
const failMonth = months[months.length - 1]
const before = JSON.stringify(progress)
const bad = await archiveLog({}, progress, now, store(failMonth))
ok('failed write reports an error', Boolean(bad.error))
ok('failed write returns the input progress unchanged', bad.progress === progress && JSON.stringify(bad.progress) === before)

const good = await archiveLog({}, progress, now, store())
ok('successful archive has no error', !good.error)
ok('log shrinks to the kept entries', good.progress.log.length === kept.length)
ok('watermark and months updated', good.progress.logArchive.watermark === plan.newWatermark && good.progress.logArchive.months.join() === months.slice().sort().join())
ok('other device entry preserved in the month file', files.get(m0).entries.some((e) => e.key === 'other|x'))
const full = await loadFullLog({}, good.progress, store())
ok('full log = original + other device entry, deduped and sorted', full.length === log.length + 1 && full.every((e, i) => i === 0 || full[i - 1].at <= e.at))
const again = await archiveLog({}, good.progress, now, store())
ok('second run archives nothing', again.archived === 0 && again.progress === good.progress)

console.log(failed ? `\nFAIL (${failed})` : '\nPASS')
process.exit(failed ? 1 : 0)
