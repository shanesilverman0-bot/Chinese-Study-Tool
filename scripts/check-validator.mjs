// Usage: node scripts/check-validator.mjs
// Phase 11: exercise validator against the two fixtures, a truncated string, and the input-file builder. Read-only.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SEED_VOCAB } from '../src/data/vocab.js'
import { buildItemIndex } from '../src/lib/items.js'
import { validateExerciseFile } from '../src/lib/exerciseValidator.js'
import { batchesOf, buildInputFile, typePlan } from '../src/lib/exerciseInput.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => fs.readFileSync(path.join(ROOT, 'scripts/fixtures', f), 'utf8')

// Same shape the app builds in src/data/ccc.js (that file needs Vite's import.meta.glob).
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
const itemIndex = buildItemIndex({ tocfl: SEED_VOCAB, ccc: rows })

let fail = 0
const check = (label, ok, extra = '') => {
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)
}

const good = validateExerciseFile(read('exercises-good.json'), { itemIndex, listId: 'pleco:11月學字', existingFiles: [] })
check('good: 4 accepted, 0 rejected, no fatal', good.accepted.length === 4 && good.rejected.length === 0 && !good.fatal,
  `(${good.accepted.length}/${good.rejected.length}) warnings: ${JSON.stringify(good.warnings)}`)
check('good: no warnings', good.warnings.length === 0)

const bad = validateExerciseFile(read('exercises-bad.json'), { itemIndex, listId: 'pleco:11月學字', existingFiles: [] })
console.log('\nbad fixture report:')
for (const r of bad.rejected) console.log(`  ${r.id}: ${r.reasons.join(' | ')}`)
for (const w of bad.warnings) console.log(`  warning: ${w}`)
check('bad: 5 rejected, 1 accepted', bad.rejected.length === 5 && bad.accepted.length === 1)
check('bad: exactly 1 warning, for 们', bad.warnings.length === 1 && bad.warnings[0].includes('们'))

const wrapped = '```json\n' + read('exercises-good.json') + '\n```'
check('fences stripped', validateExerciseFile('Here is your file:\n' + wrapped, { itemIndex, existingFiles: [] }).accepted.length === 4)

const cut = read('exercises-good.json').slice(0, 400)
let threw = false
let trunc
try { trunc = validateExerciseFile(cut, { itemIndex, existingFiles: [] }) } catch { threw = true }
check('truncated JSON: fatal, no throw', !threw && !!trunc?.fatal, trunc?.fatal ? `(${trunc.fatal.slice(0, 60)}…)` : '')
check('garbage input: fatal, no throw', !!validateExerciseFile(undefined, {}).fatal && !!validateExerciseFile('no json here', {}).fatal)

// Input file: 10-item list, variant 1 and 2, avoid from an imported variant-1 file.
const list = {
  id: 'pleco:11月學字', name: '11月學字',
  itemKeys: ['服裝|fúzhuāng', '爬山|páshān', '遺憾|yíhàn', '完整|wánzhěng', '實際|shíjì', '溫馨|wēnxīn', '拒絕|jùjué', '外婆|wàipó', '奶奶|nǎinai', '新任|xīnrèn'],
}
check('batchesOf: 1 batch of 10', batchesOf(list).length === 1 && batchesOf(list)[0].length === 10)
const plan1 = typePlan(list.itemKeys, 1)
const total = plan1.reduce((n, p) => n + p.targets.length, 0)
check('plan v1 covers 10 items once', total === 10 && new Set(plan1.flatMap((p) => p.targets)).size === 10,
  plan1.map((p) => `${p.type}×${p.targets.length}`).join(' '))
check('plan v1: cloze items 3 → one passage of 3', plan1.filter((p) => p.type === 'cloze').map((p) => p.targets.length).join() === '3')
const goodFile = JSON.parse(read('exercises-good.json'))
const in2 = buildInputFile({ list, batch: 1, variant: 2, index: itemIndex, existingFiles: [goodFile] })
check('input v2: avoid includes variant-1 sentences', in2.avoid.sentences.includes(goodFile.exercises[1].sentence) &&
  in2.avoid.distractors['遺憾|yíhàn']?.length === 1)
check('input: variant, items, band', in2.variant === 2 && in2.items.length === 10 && in2.targetBand === 'C' && in2.idPrefix === 'pleco-11月學字-b1-v2',
  `(band ${in2.targetBand}, ${in2.idPrefix})`)

console.log(fail ? `\n${fail} check(s) FAILED` : '\nAll checks passed')
process.exit(fail ? 1 : 0)
