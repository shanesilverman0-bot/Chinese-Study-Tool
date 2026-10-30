#!/usr/bin/env node
// scripts/build-vocab.mjs: DESIGN §4.4. Rebuilds the word data from data-src/.
//
//   node scripts/build-vocab.mjs
//
// Reads  data-src/tocfl-cedict.csv, data-src/dangdai-expanded.csv,
//        data-src/gloss-overrides.csv
// Writes src/data/vocab.js, vocab/cccc-book1..6.json, data-src/gloss-review.csv
// Replaces the old scripts/convert-dangdai.mjs. Generated files: never edit by hand.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv, csvEscape } from './csv.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'data-src')

const LEVELS = ['Novice', 'A1', 'A2', 'B1', 'B2', 'C']
const LEVEL_LABELS = { Novice: '準備級', A1: '入門級', A2: '基礎級', B1: '進階級', B2: '高階級', C: '流利級' }
const LEVEL_TO_BAND = { Novice: 'Novice', A1: 'A', A2: 'A', B1: 'B', B2: 'B', C: 'C' }
const BOOK_TO_BAND = { 1: 'A', 2: 'A', 3: 'B', 4: 'B', 5: 'C', 6: 'C' }

const TONE_MARKS = {
  1: 'āēīōūǖĀĒĪŌŪ',
  2: 'áéíóúǘÁÉÍÓÚ',
  3: 'ǎěǐǒǔǚǍĚǏǑǓ',
  4: 'àèìòùǜÀÈÌÒÙ',
}

// Tone numbers read from the tone marks of the first reading, in order.
// All-neutral readings give [5] (same as the old arrays and tonesFromPinyin).
function tonesOf(pinyin) {
  const first = String(pinyin).split('/')[0]
  const tones = []
  for (const ch of first) {
    for (const t of [1, 2, 3, 4]) {
      if (TONE_MARKS[t].includes(ch)) { tones.push(t); break }
    }
  }
  return tones.length ? tones : [5]
}

const normPinyin = (p) => String(p ?? '').normalize('NFC').toLowerCase().replace(/[\s'’\-·]/g, '')

// Split on `sep` outside (), （）and [].
function splitTop(s, sep) {
  const out = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if ('([（'.includes(ch)) depth++
    else if (')]）'.includes(ch)) depth = Math.max(0, depth - 1)
    if (ch === sep && depth === 0) { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur)
  return out.map((x) => x.trim()).filter(Boolean)
}

const posTokens = (pos) => String(pos || '').split('/').map((x) => x.trim()).filter(Boolean)

const read = (f) => parseCsv(fs.readFileSync(path.join(SRC, f), 'utf8'))

// ─── TOCFL ─────────────────────────────────────────────────────────────────
const tocflRows = read('tocfl-cedict.csv')
const overridesPath = path.join(SRC, 'gloss-overrides.csv')
const overrides = new Map(
  fs.existsSync(overridesPath) ? parseCsv(fs.readFileSync(overridesPath, 'utf8')).map((r) => [r.key, r.english]) : []
)

const levelOf = (id) => LEVELS[Number(/^L(\d)/.exec(id)?.[1])]

let unpairedVariantRows = 0
const parsed = tocflRows.map((r, index) => {
  const forms = r.Traditional.split('/').map((x) => x.trim()).filter(Boolean)
  const hanzi = forms[0]
  let variants = []
  if (r.Variants) {
    try {
      variants = JSON.parse(r.Variants).map((v) => ({ hanzi: v.Traditional, pinyin: v.Pinyin }))
    } catch { /* fall through to pairing by position */ }
  }
  if (!variants.length && forms.length > 1) {
    unpairedVariantRows++
    const readings = r.Pinyin.split('/')
    variants = forms.map((h, i) => ({ hanzi: h, pinyin: readings[i] ?? readings[0] }))
  }
  // Forms written with a bracketed optional part (小孩(子)) already encode their
  // variants in the key; Variants then lists the expanded forms. Don't show those twice.
  const seen = new Set()
  variants = variants.filter((v) => {
    const k = `${v.hanzi}|${v.pinyin}`
    if (!v.hanzi || v.hanzi === hanzi || /[()（）]/.test(hanzi) || seen.has(k)) return false
    seen.add(k)
    return true
  })
  return {
    index, id: r.ID, level: levelOf(r.ID), hanzi, pinyin: r.Pinyin, pos: r.POS,
    variants, meaning: r.Meaning, row: r,
  }
})

// Group by (first form, full pinyin string): keeps every old key unchanged.
const groups = new Map()
for (const p of parsed) {
  const k = `${p.hanzi}|${p.pinyin}`
  if (!groups.has(k)) groups.set(k, [])
  groups.get(k).push(p)
}

let extraSenses = 0
let duplicates = 0
const senses = [] // { rowIndex, key, ... } in source order
const groupInfo = new Map() // key → { main, extras: [sense] }

for (const [gkey, rows] of groups) {
  const ordered = [...rows].sort((a, b) =>
    LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || a.id.localeCompare(b.id))
  const main = ordered[0]
  const mainSense = { src: main, key: gkey, pos: main.pos, level: main.level, levels: [main.level], ids: [main.id] }
  const extras = []
  const posCount = {}
  for (const r of ordered.slice(1)) {
    if (r.pos === main.pos) {
      duplicates++
      if (!mainSense.levels.includes(r.level)) mainSense.levels.push(r.level)
      mainSense.ids.push(r.id)
      continue
    }
    const tag = r.pos || '_'
    posCount[tag] = (posCount[tag] || 0) + 1
    const suffix = posCount[tag] === 1 ? tag : `${tag}-${posCount[tag]}`
    extras.push({ src: r, key: `${gkey}#${suffix}`, pos: r.pos, level: r.level, levels: [r.level], ids: [r.id], senseOf: gkey })
    extraSenses++
  }
  mainSense.senses = extras.map((e) => e.key)
  groupInfo.set(gkey, { main: mainSense, extras, all: [mainSense, ...extras], variants: main.variants })
  senses.push(mainSense, ...extras)
}
senses.sort((a, b) => a.src.index - b.src.index)

// ─── CCC rows ──────────────────────────────────────────────────────────────
const cccRaw = read('dangdai-expanded.csv')
let characterNames = 0
let nameRows = 0
const cccRows = []
const idSeen = {}
for (const r of cccRaw) {
  const tags = r.Tags.split(/[;|]/).map((t) => t.trim()).filter(Boolean)
  if (tags.includes('Character Name')) { characterNames++; continue }
  const m = /^B(\d+)L(\d+)-([^-]+)-/.exec(r.ID)
  if (!m) { console.warn(`WARN: unparseable CCC id ${r.ID}`); continue }
  const isName = tags.includes('Name')
  if (isName) nameRows++
  // The source reuses an ID for alternative readings (這 zhè / zhèi share B1L01-I-12):
  // the first keeps the ID, repeats get -2, -3 so rows stay distinct by id.
  idSeen[r.ID] = (idSeen[r.ID] || 0) + 1
  const id = idSeen[r.ID] === 1 ? r.ID : `${r.ID}-${idSeen[r.ID]}`
  cccRows.push({
    id, hanzi: r.Traditional, pinyin: r.Pinyin, english: r.Meaning, pos: r.POS,
    book: Number(m[1]), lesson: Number(m[2]), part: m[3], isName,
  })
}

// pickSense (DESIGN §4.3): the sense whose pos equals the given POS, else one
// whose '/' list contains it. null when none fits.
function pickSense(info, pos) {
  if (!pos) return null
  return info.all.find((s) => s.pos === pos) ?? info.all.find((s) => posTokens(s.pos).includes(pos)) ?? null
}

// hanzi (key form or variant) → groups, for the CCC gloss lookup.
const byHanzi = new Map()
for (const [gkey, info] of groupInfo) {
  const forms = [gkey.split('|')[0], ...info.variants.map((v) => v.hanzi)]
  for (const h of forms) {
    if (!byHanzi.has(h)) byHanzi.set(h, new Set())
    byHanzi.get(h).add(gkey)
  }
}
function groupMatchesPinyin(gkey, info, pinyin) {
  const n = normPinyin(pinyin)
  const parts = [...gkey.slice(gkey.indexOf('|') + 1).split('/'), ...info.variants.map((v) => v.pinyin)]
  return parts.some((p) => normPinyin(p) === n)
}

const cccGloss = new Map() // sense key → first matching CCC english
for (const row of cccRows) {
  if (row.isName) continue
  for (const gkey of byHanzi.get(row.hanzi) ?? []) {
    const info = groupInfo.get(gkey)
    if (!groupMatchesPinyin(gkey, info, row.pinyin)) continue
    const sense = pickSense(info, row.pos)
    if (sense && !cccGloss.has(sense.key)) cccGloss.set(sense.key, row.english)
  }
}

// ─── Gloss per sense ───────────────────────────────────────────────────────
const CLASSIFIER = /^(classifier|CL:|measure word)/i

function cedictGloss(sense, info) {
  const hanzi = sense.key.split('|')[0]
  const all = String(sense.src.meaning)
  const segs = all.split('<br>').map((s) => s.trim()).filter(Boolean)
  let seg = segs.find((s) => s.startsWith(`${hanzi} [`)) ?? segs.find((s) => s.startsWith(hanzi))
  if (!seg) seg = segs.length > 1 ? segs[0] : all
  seg = seg.replace(/^\S+ \[[^\]]*\]\s*/, '')
  const parts = splitTop(seg, '/')
  const isM = sense.pos === 'M'
  const keep = (p) => (isM ? CLASSIFIER.test(p) : !CLASSIFIER.test(p) && !/^CL:/.test(p))
  const filtered = parts.filter(keep)
  const top = (arr) => arr.slice(0, 3).join('; ')
  if (filtered.length) return { english: top(filtered), source: 'cedict-pos' }
  return { english: top(parts), source: 'cedict' }
}

const counts = { override: 0, ccc: 0, 'cedict-pos': 0, cedict: 0 }
const entries = []
const unknownOverrides = new Set(overrides.keys())
for (const s of senses) {
  const info = groupInfo.get(s.senseOf ?? s.key)
  let english, glossSource
  if (overrides.has(s.key)) {
    english = overrides.get(s.key); glossSource = 'override'; unknownOverrides.delete(s.key)
  } else if (cccGloss.has(s.key)) {
    english = cccGloss.get(s.key); glossSource = 'ccc'
  } else {
    const g = cedictGloss(s, info)
    english = g.english; glossSource = g.source
  }
  if (!english) { english = String(s.src.meaning).split('<br>')[0]; glossSource = 'cedict' }
  counts[glossSource]++
  s.english = english
  s.glossSource = glossSource
  const [hanzi, ...rest] = s.key.split('|')
  const pinyin = rest.join('|').split('#')[0]
  const e = { key: s.key, hanzi, pinyin, english, glossSource, level: s.level, band: LEVEL_TO_BAND[s.level], pos: s.pos }
  if (s.senseOf) e.senseOf = s.senseOf
  if (s.senses?.length) e.senses = s.senses
  const variants = s.senseOf ? info.variants : s.src.variants
  if (variants.length) e.variants = variants
  e.tocflId = s.ids[0]
  if (s.ids.length > 1) { e.levels = s.levels; e.tocflIds = s.ids } // merged true duplicates
  e.tones = tonesOf(pinyin)
  entries.push(e)
}
for (const k of unknownOverrides) console.warn(`WARN: gloss-overrides.csv has an unknown key: ${k}`)

// ─── Write src/data/vocab.js ───────────────────────────────────────────────
const vocabJs = `// Auto-generated by scripts/build-vocab.mjs from data-src/tocfl-cedict.csv
// (TOCFL 2022/2023) - ${entries.length} senses. Never edit by hand; re-run the script.
// One entry per sense (DESIGN §4.4). Levels: Novice 準備, A1 入門, A2 基礎, B1 進階, B2 高階, C 流利.

export const BANDS = ['Novice', 'A', 'B', 'C'];

// Display labels for each band (TOCFL level names)
export const BAND_LABELS = {
  Novice: '準備級',
  A: '入門/基礎',
  B: '進階/高階',
  C: '流利級',
};

export const LEVELS = ${JSON.stringify(LEVELS)};

export const LEVEL_LABELS = ${JSON.stringify(LEVEL_LABELS)};

const RAW = [
${entries.map((e) => '  ' + JSON.stringify(e)).join(',\n')}
];

// Every seed entry is a TOCFL word. The UI filters cards by \`v.source\`
// (see Dashboard.jsx: \`v.source === 'tocfl'\`), so tag them here. Spreading
// \`v\` last lets any future entry override the default if it ever needs to.
export const vocab = RAW.map((v) => ({ source: 'tocfl', ...v }));

export const SEED_VOCAB = vocab;
`
fs.writeFileSync(path.join(ROOT, 'src/data/vocab.js'), vocabJs, 'utf8')

// ─── Write vocab/cccc-book*.json ───────────────────────────────────────────
const cccPerBook = {}
let withExtraKey = 0
for (const row of cccRows) {
  const e = {
    id: row.id, hanzi: row.hanzi, pinyin: row.pinyin, english: row.english,
    book: row.book, lesson: row.lesson, part: row.part,
    band: [BOOK_TO_BAND[row.book] ?? 'A'], tones: tonesOf(row.pinyin),
  }
  if (row.pos) e.pos = row.pos
  if (row.isName) e.tags = ['name']
  // An exact hanzi|pinyin match whose POS picks an extra sense is a different card.
  const info = groupInfo.get(`${row.hanzi}|${row.pinyin}`)
  if (info && !row.isName) {
    const s = pickSense(info, row.pos)
    if (s && s.senseOf) { e.key = s.key; withExtraKey++ }
  }
  ;(cccPerBook[row.book] ||= []).push(e)
}
fs.mkdirSync(path.join(ROOT, 'vocab'), { recursive: true })
for (const [b, vocab] of Object.entries(cccPerBook)) {
  const book = Number(b)
  const band = BOOK_TO_BAND[book] ?? '?'
  const lessons = new Set(vocab.map((v) => v.lesson)).size
  const head = JSON.stringify({
    name: `CCCC Book ${book}`,
    description: `A Course in Contemporary Chinese (當代中文課程), Book ${book} — TOCFL Band ${band}`,
    source: 'dangdai', book, band, lessons, total: vocab.length,
  }).slice(0, -1)
  const body = `${head},"vocab":[\n${vocab.map((v) => '  ' + JSON.stringify(v)).join(',\n')}\n]}\n`
  fs.writeFileSync(path.join(ROOT, 'vocab', `cccc-book${book}.json`), body, 'utf8')
}

// ─── Write data-src/gloss-review.csv ───────────────────────────────────────
const review = []
for (const e of entries) {
  const info = groupInfo.get(e.senseOf ?? e.key)
  const hasExtras = info.extras.length > 0
  if (!hasExtras) continue
  if (e.glossSource === 'override' || e.glossSource === 'ccc') continue
  const others = info.all.filter((s) => s.key !== e.key).map((s) => `${s.pos}: ${s.english}`).join(' || ')
  review.push([e.key, e.level, e.pos, e.english, e.glossSource, others])
}
fs.writeFileSync(
  path.join(SRC, 'gloss-review.csv'),
  ['key,level,pos,english,glossSource,otherSenses', ...review.map((r) => r.map(csvEscape).join(','))].join('\n') + '\n',
  'utf8'
)

// ─── Summary ───────────────────────────────────────────────────────────────
const withVariants = entries.filter((e) => e.variants).length
console.log('TOCFL')
console.log(`  rows                 ${tocflRows.length}`)
console.log(`  groups (main senses) ${groups.size}`)
console.log(`  extra senses         ${extraSenses}`)
console.log(`  true duplicates      ${duplicates}`)
console.log(`  senses written       ${entries.length}`)
console.log(`  entries w/ variants  ${withVariants}`)
console.log(`  rows paired by position (no Variants JSON): ${unpairedVariantRows}`)
console.log(`  glossSource          ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  ')}`)
console.log(`  gloss-review rows    ${review.length}`)
console.log('CCC')
for (const [b, v] of Object.entries(cccPerBook)) console.log(`  Book ${b}: ${v.length} rows`)
console.log(`  total kept           ${cccRows.length}`)
console.log(`  'Name' rows (kept, tagged)  ${nameRows}`)
console.log(`  'Character Name' rows skipped ${characterNames}`)
console.log(`  rows keyed to an extra sense  ${withExtraKey}`)
