// Usage: node scripts/check-vocab.mjs [local-data/progress.copy.json]
// Checks the generated word data (DESIGN §4.4, Phase 2.5). Exit 1 on any FAIL.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from './csv.mjs'
import { SEED_VOCAB, LEVELS } from '../src/data/vocab.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const progressFile = process.argv[2] ?? path.join(ROOT, 'local-data/progress.copy.json')

let fails = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  if (!ok) fails++
}

const byKey = new Map(SEED_VOCAB.map((v) => [v.key, v]))
const src = parseCsv(fs.readFileSync(path.join(ROOT, 'data-src/tocfl-cedict.csv'), 'utf8'))

// 1. every source row is accounted for
const mains = SEED_VOCAB.filter((v) => !v.senseOf)
const extras = SEED_VOCAB.filter((v) => v.senseOf)
const merged = mains.reduce((n, v) => n + (v.tocflIds ? v.tocflIds.length - 1 : 0), 0)
check(`TOCFL rows ${src.length} accounted for`, mains.length + extras.length + merged === src.length,
  `main ${mains.length} + extra ${extras.length} + merged ${merged}`)
check('keys are unique', byKey.size === SEED_VOCAB.length, `${SEED_VOCAB.length} senses`)
check('every extra sense points at an existing main sense that lists it',
  extras.every((e) => byKey.get(e.senseOf)?.senses?.includes(e.key)))

// 2. every pre-2.5 key survives (old keys = first form | full pinyin of every source row)
const oldKeys = new Set(src.map((r) => `${r.Traditional.split('/')[0].trim()}|${r.Pinyin}`))
const gone = [...oldKeys].filter((k) => !byKey.has(k))
check('every old TOCFL key still exists', gone.length === 0, `${gone.length} missing`)
if (gone.length) console.log('  missing:', gone.slice(0, 20).join('  '))

let reviewedKeys = []
if (fs.existsSync(progressFile)) {
  const p = JSON.parse(fs.readFileSync(progressFile, 'utf8'))
  reviewedKeys = Object.entries(p.cards || {})
    .filter(([, c]) => (c.reps ?? 0) > 0)
    .map(([k, c]) => (c.hanzi && c.pinyin ? `${c.hanzi}|${c.pinyin}` : k))
  const notTocfl = reviewedKeys.filter((k) => !byKey.has(k)) // must then be CCC keys
  const cccKeys = new Set()
  for (let b = 1; b <= 6; b++) {
    for (const v of JSON.parse(fs.readFileSync(path.join(ROOT, `vocab/cccc-book${b}.json`), 'utf8')).vocab) {
      cccKeys.add(v.key ?? `${v.hanzi}|${v.pinyin}`)
    }
  }
  const missing = notTocfl.filter((k) => !cccKeys.has(k))
  check(`all ${reviewedKeys.length} reviewed card keys still resolve to a word`, missing.length === 0,
    `${missing.length} missing`)
  if (missing.length) console.log('  missing:', missing.slice(0, 20).join('  '))
} else {
  console.log(`SKIP  reviewed-card check (no ${progressFile})`)
}

// 3. spot checks
const bi = byKey.get('筆|bǐ')
check('筆|bǐ english contains "pen", level Novice', !!bi && /pen/i.test(bi.english) && bi.level === 'Novice',
  bi && `${bi.level}: ${bi.english}`)
const biM = byKey.get('筆|bǐ#M')
check('筆|bǐ#M exists, level B1, money/classifier', !!biM && biM.level === 'B1' && /money|classifier/i.test(biM.english),
  biM && `${biM.level}: ${biM.english}`)
const dui = byKey.get('對|duì')
check('對|duì english contains "correct" or "right"', !!dui && /correct|right/i.test(dui.english), dui?.english)
const ta = byKey.get('他|tā')
check('她 is a variant of 他|tā', !!ta?.variants?.some((v) => v.hanzi === '她' && v.pinyin === 'tā'))
const zp = SEED_VOCAB.find((v) => v.hanzi === '照片')
check('照片 has variants 相片 and 相片兒',
  !!zp?.variants?.some((v) => v.hanzi === '相片') && !!zp?.variants?.some((v) => v.hanzi === '相片兒'))

// 4. CCC
let cccTotal = 0
const cccAll = []
for (let b = 1; b <= 6; b++) {
  const pack = JSON.parse(fs.readFileSync(path.join(ROOT, `vocab/cccc-book${b}.json`), 'utf8'))
  cccTotal += pack.vocab.length
  cccAll.push(...pack.vocab)
  if (pack.total !== pack.vocab.length) check(`book ${b} total field matches`, false)
}
check('CCC: 4,960 rows kept', cccTotal === 4960, String(cccTotal))
check('CCC row ids are unique', new Set(cccAll.map((v) => v.id)).size === cccAll.length)
check('CCC: B1 lesson 13 has a row 對 with pos Prep',
  cccAll.some((v) => v.book === 1 && v.lesson === 13 && v.hanzi === '對' && v.pos === 'Prep'))
check('CCC: 筆 (M) in Book 4 is keyed to 筆|bǐ#M',
  cccAll.some((v) => v.book === 4 && v.hanzi === '筆' && v.pos === 'M' && v.key === '筆|bǐ#M'))
check('CCC: every row with a key points at an existing TOCFL sense', cccAll.every((v) => !v.key || byKey.has(v.key)))

// 5. reports
console.log('\nLevel counts')
for (const L of LEVELS) console.log(`  ${L.padEnd(6)} ${SEED_VOCAB.filter((v) => v.level === L).length}`)
const multi = reviewedKeys.filter((k) => byKey.get(k)?.senses?.length)
console.log(`\nReviewed cards on keys that now have extra senses: ${multi.length} (expect ≈ 29)`)
if (multi.length) console.log('  ' + multi.join('  '))

console.log(fails ? `\n${fails} FAIL` : '\nAll PASS')
process.exit(fails ? 1 : 0)
