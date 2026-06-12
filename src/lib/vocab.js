// src/lib/vocab.js
// Runtime vocab-pack loader + pinyin → tones derivation.
//
// Vocab pack JSON schema (dangdai-aligned):
//   {
//     name: string,
//     description?: string,
//     vocab: [
//       {
//         // character fields (aliases supported)
//         hanzi / traditional / word: string,
//
//         // pronunciation (tone marks, not numbers)
//         pinyin / reading: string,
//
//         // translation
//         english / definition / meaning: string,
//
//         // TOCFL band(s) — string OR array of strings
//         // e.g. "A" or ["A","B"] for cross-band words
//         band?: string | string[],
//
//         // CCCC textbook location (all optional but used for study filtering)
//         book?:   number,   // 1–6
//         lesson?: number,   // 1–N
//         part?:   string,   // "I" or "II"
//
//         // Part of speech (passed through from dangdai.csv)
//         pos?: string,
//
//         // Pre-computed tones (optional; auto-derived from pinyin if absent)
//         tones?: number[],  // 1=flat 2=rising 3=dip 4=falling 5=neutral
//       }
//     ]
//   }
//
// The dangdai.csv columns map directly:
//   traditional → hanzi
//   pinyin      → pinyin
//   english     → english
//   book        → book   (number)
//   lesson      → lesson (number)
//   part        → part   ("I" | "II")
//   pos         → pos
//
// Band is derived from book number if not explicit:
//   book 1–2 → "A"
//   book 3–4 → "B"
//   book 5–6 → "C"

// ─── Tone mark tables ────────────────────────────────────────────────────────
// IMPORTANT: each string contains exactly the vowels with that tone diacritic.
// Walk the pinyin string left-to-right; the first tone-marked character in each
// syllable gives that syllable's tone. This handles both spaced ("nǐ hǎo") and
// unspaced ("duìbuqǐ") pinyin correctly.
const TONE_MARKS = {
  1: 'āēīōūǖĀĒĪŌŪ',
  2: 'áéíóúǘÁÉÍÓÚ',
  3: 'ǎěǐǒǔǚǍĚǏǑǓ',
  4: 'àèìòùǜÀÈÌÒÙ',
}

export function tonesFromPinyin(pinyin) {
  if (!pinyin) return [5]
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

// Primary tone for reference contour selection: first non-neutral tone, or
// the first tone if all are neutral.
export function primaryTone(tones) {
  if (!tones || !tones.length) return 1
  return tones.find((t) => t !== 5) ?? tones[0]
}

// ─── Band derivation from CCCC book number ───────────────────────────────────
const BOOK_TO_BAND = { 1: 'A', 2: 'A', 3: 'B', 4: 'B', 5: 'C', 6: 'C' }

function deriveBand(entry) {
  // Explicit band field wins (may already be an array)
  if (entry.band) {
    return Array.isArray(entry.band) ? entry.band : [entry.band]
  }
  // Derive from book number
  if (entry.book) {
    const b = BOOK_TO_BAND[Number(entry.book)]
    if (b) return [b]
  }
  return ['A'] // fallback
}

// ─── Field alias resolution ───────────────────────────────────────────────────
function normalizeEntry(raw) {
  const hanzi = raw.hanzi ?? raw.traditional ?? raw.word ?? ''
  const pinyin = raw.pinyin ?? raw.reading ?? ''
  const english = raw.english ?? raw.definition ?? raw.meaning ?? ''
  const tones = raw.tones ?? tonesFromPinyin(pinyin)
  const band = deriveBand(raw)

  const entry = { hanzi, pinyin, english, tones, band }

  // CCCC location fields — preserve if present
  if (raw.book   != null) entry.book   = Number(raw.book)
  if (raw.lesson != null) entry.lesson = Number(raw.lesson)
  if (raw.part   != null) entry.part   = String(raw.part)   // "I" | "II"
  if (raw.pos    != null) entry.pos    = String(raw.pos)

  return entry
}

// ─── Unique vocab ID ──────────────────────────────────────────────────────────
// Stable across loads: hanzi + pinyin so homophones with different meanings
// don't collide, and same word in two packs shares progress.
export function vocabId(entry) {
  return `${entry.hanzi}|${entry.pinyin}`
}

// ─── Pack loader ──────────────────────────────────────────────────────────────
// loadVocabPack(json) — accepts the raw parsed JSON object and returns a
// normalized pack with a flat vocab array ready for the review loop.
export function loadVocabPack(json) {
  if (!json || !Array.isArray(json.vocab)) {
    throw new Error('Invalid vocab pack: missing "vocab" array')
  }
  return {
    name: json.name ?? 'Unnamed Pack',
    description: json.description ?? '',
    vocab: json.vocab.map(normalizeEntry),
  }
}

// ─── Study filter helpers ─────────────────────────────────────────────────────
// These are used by the UI to build the Book → Lesson → Part selector tree.

// Returns all unique (book, lesson, part) combos in a pack, sorted.
export function getPackStructure(pack) {
  const seen = new Map()
  for (const v of pack.vocab) {
    if (v.book == null) continue
    const key = `${v.book}|${v.lesson ?? ''}|${v.part ?? ''}`
    if (!seen.has(key)) {
      seen.set(key, { book: v.book, lesson: v.lesson ?? null, part: v.part ?? null })
    }
  }
  return [...seen.values()].sort((a, b) =>
    a.book !== b.book ? a.book - b.book :
    a.lesson !== b.lesson ? (a.lesson ?? 0) - (b.lesson ?? 0) :
    (a.part ?? '') < (b.part ?? '') ? -1 : 1
  )
}

// Filters vocab by any combination of book / lesson / part.
// Pass null to skip that level of filtering.
export function filterVocab(vocab, { book = null, lesson = null, part = null } = {}) {
  return vocab.filter((v) => {
    if (book   != null && v.book   !== book)   return false
    if (lesson != null && v.lesson !== lesson) return false
    if (part   != null && v.part   !== part)   return false
    return true
  })
}

// Filters vocab by band membership (entry.band is always an array now).
export function filterByBand(vocab, bands) {
  if (!bands || bands.length === 0) return vocab
  const set = new Set(bands)
  return vocab.filter((v) => v.band.some((b) => set.has(b)))
}

// ─── BANDS constant (used by Settings UI) ────────────────────────────────────
export const BANDS = ['Novice', 'A', 'B', 'C']
