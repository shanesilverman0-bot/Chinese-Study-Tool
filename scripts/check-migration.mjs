// Usage: node scripts/check-migration.mjs <input.json>
// Runs migrate() on a copy of progress.json, prints stats, checks the DESIGN
// §6.1 invariants and writes local-data/progress.migrated.json. Exit 1 on FAIL.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { migrate, isStub } from '../src/lib/migrate.js'
import { emptyCollections } from '../src/lib/schema.js'

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/check-migration.mjs <input.json>')
  process.exit(1)
}

const input = JSON.parse(readFileSync(file, 'utf8'))
const NOW = '2026-10-29T00:00:00.000Z'
const out = migrate(structuredClone(input), { now: NOW, device: 'check-migration' })

const inCards = Object.entries(input.cards || {})
const inLog = input.log || []
const loggedKeys = new Set(inLog.map((e) => e.key))
const legacy = inCards.filter(([, c]) => !c.hanzi || c.pinyin == null).length
const size = (o) => JSON.stringify(o).length

const outCards = Object.entries(out.cards)
const kept = new Set(Object.keys(out.cards))
const removed = inCards.filter(([k]) => !kept.has(k))
const record = out.migrations[out.migrations.length - 1]
const nullFirstSeen = outCards.filter(([, c]) => c.reps > 0 && c.firstSeen == null).length

console.log('INPUT')
console.log(`  cards:            ${inCards.length}`)
console.log(`  reviewed (reps>0): ${inCards.filter(([, c]) => c.reps > 0).length}`)
console.log(`  log length:       ${inLog.length}`)
console.log(`  legacy id-keyed:  ${legacy}`)
console.log(`  top-level keys:   ${Object.keys(input).join(', ')}`)
console.log('OUTPUT')
console.log(`  schemaVersion:    ${out.schemaVersion}`)
console.log(`  cards kept:       ${outCards.length}`)
console.log(`  stubs removed:    ${removed.length}`)
console.log(`  with firstSeen:   ${outCards.filter(([, c]) => c.firstSeen).length} (reps>0 with null firstSeen: ${nullFirstSeen})`)
console.log(`  collections added: ${Object.keys(emptyCollections()).filter((k) => input[k] === undefined).join(', ')}`)
console.log(`  size before/after (compact JSON): ${size(input)} / ${size(out)} bytes`)

const stripFirstSeen = (c) => {
  const { firstSeen, ...rest } = c
  return rest
}
const second = migrate(structuredClone(out), { now: NOW, device: 'check-migration' })

const results = [
  ['idempotent', isDeepStrictEqual(second, out)],
  [
    'every non-stub card kept, fields identical except firstSeen',
    inCards.every(([k, c]) => isStub(c, k, loggedKeys) || (kept.has(k) && isDeepStrictEqual(stripFirstSeen(out.cards[k]), stripFirstSeen(c)))),
  ],
  ['every removed card is a stub', removed.every(([k, c]) => isStub(c, k, loggedKeys))],
  ['removedStubs matches count removed', record.removedStubs === removed.length],
  [
    'every reps>0 card kept',
    inCards.every(([k, c]) => !(c.reps > 0) || (kept.has(k) && isDeepStrictEqual(stripFirstSeen(out.cards[k]), stripFirstSeen(c)))),
  ],
  ['log length unchanged', out.log.length === inLog.length],
  ['all top-level keys kept', Object.keys(input).every((k) => k in out)],
  ['legacy `version` field untouched', input.version === undefined || out.version === input.version],
]

let failed = false
for (const [name, ok] of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failed = true
}

mkdirSync('local-data', { recursive: true })
writeFileSync('local-data/progress.migrated.json', JSON.stringify(out, null, 2))
console.log('Wrote local-data/progress.migrated.json')
process.exit(failed ? 1 : 0)
