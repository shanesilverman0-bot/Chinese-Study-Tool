#!/usr/bin/env node
// scripts/convert-dangdai.mjs
//
// Converts dangdai-expanded.csv (ivankra/dangdai) into per-book vocab pack
// JSON files compatible with 習字.
//
// Usage:
//   node scripts/convert-dangdai.mjs dangdai-expanded.csv ./public/vocab/
//
// Output:
//   public/vocab/cccc-book1.json  ... cccc-book6.json

import fs from 'fs'
import path from 'path'

const BOOK_TO_BAND = { 1:'A', 2:'A', 3:'B', 4:'B', 5:'C', 6:'C' }

function parseCSV(text) {
  const lines = text.split(/\r?\n/)
  const headers = splitCSVRow(lines[0])
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cols = splitCSVRow(lines[i])
    const row = {}
    headers.forEach((h, idx) => { row[h.trim()] = (cols[idx] ?? '').trim() })
    rows.push(row)
  }
  return rows
}

function splitCSVRow(line) {
  const result = []
  let cur = '', inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"' && !inQuote) { inQuote = true; continue }
    if (ch === '"' && inQuote) {
      if (line[i+1] === '"') { cur += '"'; i++ }
      else inQuote = false
      continue
    }
    if (ch === ',' && !inQuote) { result.push(cur); cur = ''; continue }
    cur += ch
  }
  result.push(cur)
  return result
}

const TONE_MARKS = { 1:'āēīōūǖĀĒĪŌŪ', 2:'áéíóúǘÁÉÍÓÚ', 3:'ǎěǐǒǔǚǍĚǏǑǓ', 4:'àèìòùǜÀÈÌÒÙ' }
function tonesFromPinyin(pinyin) {
  if (!pinyin) return [5]
  const tones = []
  for (const ch of pinyin) {
    for (const tone of [1,2,3,4]) {
      if (TONE_MARKS[tone].includes(ch)) { tones.push(tone); break }
    }
  }
  return tones.length ? tones : [5]
}

const [,, csvPath, outDir] = process.argv
if (!csvPath || !outDir) {
  console.error('Usage: node scripts/convert-dangdai.mjs <dangdai-expanded.csv> <output-dir>')
  process.exit(1)
}

const csv = fs.readFileSync(csvPath, 'utf8')
const rows = parseCSV(csv)

console.log(`Parsed ${rows.length} rows`)
console.log('Columns:', Object.keys(rows[0]).join(', '))

const books = {}
let skipped = 0
for (const r of rows) {
  const bookNum = parseInt(r.book ?? r.Book ?? '')
  if (isNaN(bookNum)) { skipped++; continue }
  if (!books[bookNum]) books[bookNum] = []
  const hanzi = (r.traditional ?? r.Traditional ?? r.word ?? '').trim()
  const pinyin = (r.pinyin ?? r.Pinyin ?? '').trim()
  const english = (r.english ?? r.English ?? r.definition ?? '').trim()
  const lesson = parseInt(r.lesson ?? r.Lesson ?? '') || null
  const part = (r.part ?? r.Part ?? '').trim() || null
  const pos = (r.pos ?? r.POS ?? '').trim() || undefined
  if (!hanzi) { skipped++; continue }
  const entry = {
    hanzi, pinyin, english,
    book: bookNum, lesson, part,
    band: [BOOK_TO_BAND[bookNum] ?? 'A'],
    tones: tonesFromPinyin(pinyin),
  }
  if (pos) entry.pos = pos
  books[bookNum].push(entry)
}

if (skipped > 0) console.warn(`Skipped ${skipped} rows`)

fs.mkdirSync(outDir, { recursive: true })

for (const [bookStr, vocab] of Object.entries(books)) {
  const book = parseInt(bookStr)
  const band = BOOK_TO_BAND[book] ?? '?'
  const lessons = [...new Set(vocab.map(v => v.lesson).filter(Boolean))].sort((a,b)=>a-b)
  const pack = {
    name: `CCCC Book ${book}`,
    description: `A Course in Contemporary Chinese (當代中文課程), Book ${book} — TOCFL Band ${band}`,
    source: 'dangdai', book, band,
    lessons: lessons.length, total: vocab.length, vocab,
  }
  const outFile = path.join(outDir, `cccc-book${book}.json`)
  fs.writeFileSync(outFile, JSON.stringify(pack, null, 2), 'utf8')
  console.log(`Book ${book}: ${vocab.length} words, ${lessons.length} lessons → ${outFile}`)
}
console.log('Done.')
