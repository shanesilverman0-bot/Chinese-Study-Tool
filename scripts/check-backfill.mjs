// Usage: node scripts/check-backfill.mjs [local-data/progress.copy.json] [startDate startBook startChapter endDate endBook endChapter]
// Phase 6: replays the review log and compares the final stability with cards[key].stability,
// lists the backfill snapshots it would create and the course-history estimate. Read-only.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SEED_VOCAB } from '../src/data/vocab.js'
import { buildItemIndex } from '../src/lib/items.js'
import { DEFAULT_STUDY_SETTINGS } from '../src/lib/schema.js'
import { migrate } from '../src/lib/migrate.js'
import { localDate, addDays } from '../src/lib/dates.js'
import { replayLog, planHistory } from '../src/lib/backfill.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const progressFile = args[0] ?? path.join(ROOT, 'local-data/progress.copy.json')
const [sd, sb, sc, ed, eb, ec] = args.slice(1)
const courseHistory = sd
  ? { start: { date: sd, book: +sb, chapter: +sc }, end: { date: ed, book: +eb, chapter: +ec } }
  : DEFAULT_STUDY_SETTINGS.courseHistory

const rows = []
for (let b = 1; b <= 6; b++) {
  const pack = JSON.parse(fs.readFileSync(path.join(ROOT, `vocab/cccc-book${b}.json`), 'utf8'))
  for (const r of pack.vocab) {
    rows.push({
      id: r.id, hanzi: r.hanzi, pinyin: r.pinyin, english: r.english, book: Number(r.book),
      chapter: Number(r.chapter ?? r.lesson), list: r.list ?? r.part, pos: r.pos, tags: r.tags, source: 'cccc',
    })
  }
}
const index = buildItemIndex({ tocfl: SEED_VOCAB, ccc: rows })
const p = migrate(JSON.parse(fs.readFileSync(progressFile, 'utf8')))
const settings = { ...DEFAULT_STUDY_SETTINGS, ...p.studySettings, courseHistory }
const hr = (t) => console.log(`\n== ${t}`)

hr(`Replay (${p.log.length} log entries)`)
const replay = replayLog(p.log)
let match = 0, noCard = 0
const mismatches = []
for (const [key, states] of replay) {
  const card = p.cards[key]
  if (!card) { noCard++; continue }
  const last = states[states.length - 1]
  if (Math.abs(last.stability - card.stability) <= 1e-6) match++
  else mismatches.push({ key, replayed: last.stability, stored: card.stability, reps: card.reps, logged: states.length })
}
const compared = match + mismatches.length
const pct = compared ? (100 * match) / compared : 0
console.log(`keys in log ${replay.size}; no card ${noCard}; compared ${compared}; match ${match} (${pct.toFixed(1)}%)`)
if (mismatches.length) {
  console.log('Mismatches (first 20): key | replayed | stored | card reps | logged reviews')
  for (const m of mismatches.slice(0, 20)) console.log(`  ${m.key} | ${m.replayed.toFixed(6)} | ${m.stored.toFixed(6)} | ${m.reps} | ${m.logged}`)
  const pre = mismatches.filter((m) => m.reps > m.logged).length
  console.log(`  of ${mismatches.length}: ${pre} have card reps > logged reviews (reviewed before the log started)`)
}
console.log(`${pct >= 95 ? 'PASS' : 'FAIL'}  >= 95% of reviewed keys match`)

hr('Snapshots Build history would add')
const tz = settings.timeZone
const plan = planHistory({
  log: p.log, progress: p, index, cccEntries: rows, settings, toDate: addDays(localDate(new Date(), tz), -1),
})
console.log(`skipped keys (no card): ${plan.skippedKeys}`)
const show = (label, list) => {
  console.log(`${label}: ${list.length}`)
  const pick = list.length > 14 ? [...list.slice(0, 7), null, ...list.slice(-7)] : list
  for (const s of pick) console.log(s ? `  ${s.date}  seen ${String(s.seen).padStart(5)}  known ${String(s.known).padStart(5)}` : '  …')
}
show(`course estimate (${courseHistory.start.date} B${courseHistory.start.book}C${courseHistory.start.chapter} -> ${courseHistory.end.date} B${courseHistory.end.book}C${courseHistory.end.chapter})`, plan.estimate)
show('review-log backfill', plan.backfill)
const all = [...plan.estimate, ...plan.backfill]
const mono = all.every((s, i) => i === 0 || s.seen >= all[i - 1].seen - 0)
console.log(`${mono ? 'PASS' : 'NOTE'}  Seen never decreases across the combined curve`)
