// Usage: node scripts/check-pleco.mjs [docs/samples/pleco-sample.xml]
// Phase 9: checks numericToToneMarks and classifies the sample cards. Read-only.
// Node has no DOMParser, so tc / pron / catassign are pulled out with regexes (script-only shortcut).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SEED_VOCAB } from '../src/data/vocab.js'
import { buildItemIndex } from '../src/lib/items.js'
import { numericToToneMarks, classify } from '../src/lib/pleco.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = process.argv[2] ?? path.join(ROOT, 'docs/samples/pleco-sample.xml')

let fail = 0
for (const [inp, want] of [
  ['xin1ren4', 'xīnrèn'], ['nai3nai5', 'nǎinai'], ['fu2zhuang1', 'fúzhuāng'],
  ['lu:4', 'lǜ'], ['nv3er2', 'nǚér'], ['hua1r5', 'huār'],
]) {
  const got = numericToToneMarks(inp)
  if (got !== want) fail++
  console.log(`${got === want ? 'PASS' : 'FAIL'}  ${inp} -> ${got} (want ${want})`)
}

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
const xml = fs.readFileSync(file, 'utf8')
const counts = {}
const cards = xml.split('<card ').slice(1)
console.log(`\n${cards.length} cards in ${path.basename(file)}`)
for (const c of cards) {
  const tc = /<headword charset="tc">([^<]*)</.exec(c)?.[1] ?? ''
  const pron = /<pron[^>]*>([^<]*)</.exec(c)?.[1] ?? ''
  const cats = [...c.matchAll(/<catassign category="([^"]*)"/g)].map((m) => m[1])
  const card = { tc, pronNumeric: pron, pinyin: numericToToneMarks(pron), defn: '', dictref: '', categories: cats }
  const r = classify(card, index)
  counts[r.status] = (counts[r.status] ?? 0) + 1
  const cand = r.candidates.length ? `  [${r.candidates.join(', ')}]` : ''
  console.log(`${tc}\t${card.pinyin}\t${r.status} (${r.via})${cand}\t${cats.join(',')}`)
}
console.log('\n' + JSON.stringify(counts))
process.exit(fail ? 1 : 0)
