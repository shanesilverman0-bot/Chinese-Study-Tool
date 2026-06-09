// Runtime vocab loader. The app ships with a seed list (src/data/vocab.js) and
// can additionally auto-discover vocab "packs" — JSON files dropped into a
// `vocab/` folder in the synced repo. Each pack is fetched, normalized, and
// merged with the seed (deduped by hanzi). This is how uploaded wordlists
// appear in the app without a rebuild.

import { SEED_VOCAB, BANDS } from '../data/vocab.js'
import { listDir, readFileContent } from './github.js'

const VOCAB_DIR = 'vocab'

// Map tone-marked vowels to tone numbers, for deriving `tones` from pinyin
// when a pack omits it.
const TONE_MARKS = {
  1: 'āēīōūǖ',
  2: 'áéíóúǘ',
  3: 'ǎěǐǒǔǚ',
  4: 'àèìòùǜ',
}

export function tonesFromPinyin(pinyin) {
  if (!pinyin) return [1]
  // Walk left-to-right and record each tone mark in the order it appears.
  // Pinyin has at most one tone mark per syllable, so this yields per-syllable
  // tones in positional order even when syllables aren't space-separated
  // (e.g. "duìbùqǐ" -> [4,4,3]). Toneless trailing syllables (neutral tone)
  // simply aren't represented, which is fine: only the leading tone drives the
  // visualizer reference contour.
  const tones = []
  for (const ch of pinyin) {
    for (const tone of [1, 2, 3, 4]) {
      if (TONE_MARKS[tone].includes(ch)) {
        tones.push(tone)
        break
      }
    }
  }
  return tones.length ? tones : [5]
}

// Normalize one raw pack entry into the app's card shape.
function normalizeEntry(raw, idx, packName) {
  const hanzi = raw.hanzi || raw.traditional || raw.word || ''
  if (!hanzi) return null
  const pinyin = raw.pinyin || raw.reading || ''
  const band = BANDS.includes(raw.band) ? raw.band : raw.level && BANDS.includes(raw.level) ? raw.level : 'Novice'
  const tones = Array.isArray(raw.tones) && raw.tones.length ? raw.tones : tonesFromPinyin(pinyin)
  const id = raw.id || `${packName}-${idx}-${hashHanzi(hanzi)}`
  const source = raw.source || 'tocfl'
  return {
    id,
    hanzi,
    pinyin,
    english: raw.english || raw.definition || raw.meaning || '',
    band,
    tones,
    source,
  }
}

function hashHanzi(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

// Parse a pack file's text. Accepts either a JSON array, or { words: [...] }.
function parsePack(text, packName) {
  let data
  try {
    data = JSON.parse(text)
  } catch (e) {
    throw new Error(`${packName}: not valid JSON (${e.message})`)
  }
  const arr = Array.isArray(data) ? data : Array.isArray(data.words) ? data.words : null
  if (!arr) throw new Error(`${packName}: expected a JSON array or { "words": [...] }`)
  return arr.map((r, i) => normalizeEntry(r, i, packName)).filter(Boolean)
}

// Fetch and merge all packs from vocab/. Returns { vocab, packs, errors }.
export async function loadVocab(github) {
  const result = { vocab: [...SEED_VOCAB], packs: [], errors: [] }
  const ready = github?.token && github?.owner && github?.repo
  if (!ready) return result

  let entries = []
  try {
    entries = await listDir(github, VOCAB_DIR)
  } catch (e) {
    result.errors.push(`Could not list ${VOCAB_DIR}/: ${e.message}`)
    return result
  }

  const jsonFiles = entries.filter((e) => e.type === 'file' && e.name.toLowerCase().endsWith('.json'))
  const seen = new Set(SEED_VOCAB.map((v) => v.hanzi))

  for (const f of jsonFiles) {
    try {
      const text = await readFileContent(github, f.path)
      const words = parsePack(text, f.name)
      let added = 0
      for (const w of words) {
        if (seen.has(w.hanzi)) continue
        seen.add(w.hanzi)
        result.vocab.push(w)
        added++
      }
      result.packs.push({ name: f.name, count: words.length, added })
    } catch (e) {
      result.errors.push(e.message)
    }
  }
  return result
}
