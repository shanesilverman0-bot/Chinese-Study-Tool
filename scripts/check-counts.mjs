// Usage: node scripts/check-counts.mjs [local-data/progress.copy.json]
// Phase 3: word data, CCC -> TOCFL matching tiers, baseline tiers, CCC/TOCFL gap table.
// (Phase 4 extends this with the counts engine.) Read-only.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SEED_VOCAB, LEVELS } from '../src/data/vocab.js'
import { buildItemIndex, baselineSets } from '../src/lib/items.js'
import { DEFAULT_STUDY_SETTINGS } from '../src/lib/schema.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const progressFile = process.argv[2] ?? path.join(ROOT, 'local-data/progress.copy.json')

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

const index = buildItemIndex({ tocfl: SEED_VOCAB, ccc: rows })
const hr = (t) => console.log(`\n== ${t}`)
const fmt = (n) => n.toLocaleString('en-US')

hr('TOCFL word data')
const mains = SEED_VOCAB.filter((v) => !v.senseOf)
const extras = SEED_VOCAB.filter((v) => v.senseOf)
console.log(`TOCFL senses: ${fmt(SEED_VOCAB.length)}  (main ${fmt(mains.length)}, extra ${fmt(extras.length)})`)
console.log(`TOCFL source rows: ${fmt(mains.reduce((n, v) => n + (v.tocflIds ? v.tocflIds.length : 1), 0) + extras.length)}`)
console.log(`CCC rows: ${fmt(rows.length)}  (name-tagged: ${rows.filter((r) => (r.tags ?? []).includes('name')).length})`)

hr('CCC -> TOCFL match tiers')
const tierOrder = ['exact', 'normalized', 'variant', 'hanzi-unique', 'ambiguous', 'none', 'name']
function tiers(subset) {
  const t = Object.fromEntries(tierOrder.map((k) => [k, 0]))
  for (const r of subset) t[index.rowInfo(r).status]++
  return t
}
const show = (label, t) => console.log(`${label.padEnd(14)} ` + tierOrder.map((k) => `${k} ${fmt(t[k])}`).join('  '))
show('Books 1-3', tiers(rows.filter((r) => r.book <= 3)))
show('All books', tiers(rows))
for (let b = 1; b <= 6; b++) show(`Book ${b}`, tiers(rows.filter((r) => r.book === b)))
console.log('\nAmbiguous (books 1-3):')
for (const r of rows.filter((r) => r.book <= 3 && index.rowInfo(r).status === 'ambiguous')) {
  console.log(`  B${r.book}L${r.chapter} ${r.hanzi}|${r.pinyin}  candidates: ${index.match(r.hanzi, r.pinyin).candidates.join(', ')}`)
}
console.log('\nhanzi-unique (books 1-3):')
for (const r of rows.filter((r) => r.book <= 3 && index.rowInfo(r).status === 'hanzi-unique')) {
  console.log(`  ${r.hanzi}|${r.pinyin} -> ${index.rowInfo(r).tocflKey}`)
}

hr('Spot checks (DESIGN §4.3, Phase 3 acceptance)')
const spot = (label, got, want) => console.log(`${got === want ? 'PASS' : 'FAIL'}  ${label} = ${got} (want ${want})`)
spot("match('這','zhèi')", `${index.match('這', 'zhèi').status} ${index.match('這', 'zhèi').key}`, 'hanzi-unique 這|zhè')
spot("match('照片','zhàopiàn').status", index.match('照片', 'zhàopiàn').status, 'variant')
spot("get('筆|bǐ#M').level", index.get('筆|bǐ#M')?.level, 'B1')
spot("match('她','tā').key", index.match('她', 'tā').key, '他|tā')

hr('Baseline tiers (defaults)')
const bl = DEFAULT_STUDY_SETTINGS.baseline
const { solid, studied } = baselineSets(index, rows, bl)
console.log(`solidThrough B${bl.solidThrough.book}C${bl.solidThrough.chapter}, studiedThrough B${bl.studiedThrough.book}C${bl.studiedThrough.chapter}`)
console.log(`solid ${fmt(solid.size)}   studied ${fmt(studied.size)}`)
const byLevel = (set) => Object.fromEntries(LEVELS.map((l) => [l, [...set].filter((k) => index.get(k).level === l).length]))
console.log('solid   by level:', JSON.stringify(byLevel(solid)))
console.log('studied by level:', JSON.stringify(byLevel(studied)))

hr('CCC <-> TOCFL gap (per level, TOCFL senses)')
const cmp = (a, b) => (a.book - b.book) || (a.chapter - b.chapter)
const last = bl.studiedThrough
console.log('level    total  through B4C4  later in CCC  never in CCC')
const tot = { total: 0, thru: 0, later: 0, never: 0 }
for (const l of LEVELS) {
  const ks = SEED_VOCAB.filter((v) => v.level === l)
  let thru = 0, later = 0, never = 0
  for (const v of ks) {
    const f = index.firstChapterOf(v.key)
    if (!f) never++
    else if (cmp(f, last) <= 0) thru++
    else later++
  }
  console.log(`${l.padEnd(7)} ${String(ks.length).padStart(6)} ${String(thru).padStart(12)} ${String(later).padStart(13)} ${String(never).padStart(13)}`)
  tot.total += ks.length; tot.thru += thru; tot.later += later; tot.never += never
}
console.log(`${'Total'.padEnd(7)} ${String(tot.total).padStart(6)} ${String(tot.thru).padStart(12)} ${String(tot.later).padStart(13)} ${String(tot.never).padStart(13)}`)

if (fs.existsSync(progressFile)) {
  const p = JSON.parse(fs.readFileSync(progressFile, 'utf8'))
  const keys = Object.keys(p.cards ?? {}).filter((k) => k.includes('|'))
  const unknown = keys.filter((k) => !index.get(k))
  hr(`Progress copy (${path.basename(progressFile)})`)
  console.log(`${keys.length} word cards, ${unknown.length} not in the item index${unknown.length ? ': ' + unknown.slice(0, 15).join('  ') : ''}`)
}
