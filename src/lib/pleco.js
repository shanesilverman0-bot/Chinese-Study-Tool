// Pleco XML import (DESIGN §4.3, §5.7–5.9, §9). Pure except for the DOMParser, which the
// caller passes in so Node scripts can supply their own. Never edits existing cards.

import { normPinyin } from './items.js'

const MARKS = {
  a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', 'ü': 'ǖǘǚǜ',
}
const VOWELS = 'aeiouü'

// "xin1ren4" -> "xīnrèn". Tone 5 or no digit -> no mark. `u:` and `v` mean ü.
export function numericToToneMarks(s) {
  const str = String(s ?? '').toLowerCase().replace(/u:/g, 'ü').replace(/v/g, 'ü')
  const tokens = str.match(/[a-zü]+[1-5]?/g) ?? []
  return tokens.map((t) => {
    const m = /^([a-zü]+)([1-5])?$/.exec(t)
    const letters = m[1]
    const tone = m[2] ? Number(m[2]) : 5
    if (tone === 5) return letters
    let at = letters.indexOf('a')
    if (at < 0) at = letters.indexOf('e')
    if (at < 0 && letters.includes('ou')) at = letters.indexOf('ou')
    if (at < 0) {
      for (let i = letters.length - 1; i >= 0; i--) if (VOWELS.includes(letters[i])) { at = i; break }
    }
    if (at < 0) return letters
    return letters.slice(0, at) + MARKS[letters[at]][tone - 1] + letters.slice(at + 1)
  }).join('')
}

// Returns { cards: [{ tc, sc, pronNumeric, pinyin, defn, dictref, categories[] }], errors[] }.
export function parsePlecoXml(text, DOMParserImpl) {
  const cards = []
  const errors = []
  const Parser = DOMParserImpl ?? (typeof DOMParser !== 'undefined' ? DOMParser : null)
  if (!Parser) return { cards, errors: ['No XML parser available'] }
  let doc
  try {
    doc = new Parser().parseFromString(String(text ?? ''), 'text/xml')
  } catch (e) {
    return { cards, errors: [`Could not parse the XML: ${e.message}`] }
  }
  if (doc.getElementsByTagName('parsererror').length) return { cards, errors: ['This is not valid XML.'] }
  const nodes = [...doc.getElementsByTagName('card')]
  if (!nodes.length) errors.push('No <card> elements found. Is this a Pleco flashcard export?')
  nodes.forEach((card, i) => {
    const entry = card.getElementsByTagName('entry')[0]
    if (!entry) { errors.push(`Card ${i + 1}: no <entry>`); return }
    const heads = [...entry.getElementsByTagName('headword')]
    const head = (cs) => (heads.find((h) => h.getAttribute('charset') === cs)?.textContent ?? '').trim()
    const prons = [...entry.getElementsByTagName('pron')]
    const pron = prons.find((p) => p.getAttribute('tones') === 'numbers') ?? prons[0]
    const pronNumeric = (pron?.textContent ?? '').trim()
    const tc = head('tc')
    const sc = head('sc')
    if (!tc && !sc) { errors.push(`Card ${i + 1}: no headword`); return }
    if (!pronNumeric) { errors.push(`Card ${i + 1} (${tc || sc}): no pronunciation`); return }
    const ref = card.getElementsByTagName('dictref')[0]
    const categories = [...card.getElementsByTagName('catassign')]
      .map((c) => (c.getAttribute('category') ?? '').trim()).filter(Boolean)
    cards.push({
      tc, sc, pronNumeric,
      pinyin: numericToToneMarks(pronNumeric),
      defn: entry.getElementsByTagName('defn')[0]?.textContent ?? '',
      dictref: ref ? `${ref.getAttribute('dictid') ?? ''}:${ref.getAttribute('entryid') ?? ''}` : '',
      categories: [...new Set(categories)],
    })
  })
  return { cards, errors }
}

// CCC items (non-alias) per hanzi, built once per index.
const cccByHanzi = new WeakMap()
function cccFor(index) {
  let m = cccByHanzi.get(index)
  if (m) return m
  m = new Map()
  for (const it of index.all()) {
    if (it.type !== 'word' || !it.sources?.includes('ccc') || it.rawAliasOf || it.inTocfl) continue
    if (!m.has(it.hanzi)) m.set(it.hanzi, [])
    m.get(it.hanzi).push(it)
  }
  cccByHanzi.set(index, m)
  return m
}

// -> { status: 'auto'|'resolve'|'outside', key, candidates[], reason, via }
export function classify(card, index) {
  if (!card.tc) return { status: 'resolve', key: null, candidates: [], reason: 'no traditional headword', via: 'none' }
  const m = index.match(card.tc, card.pinyin)
  if (['exact', 'normalized', 'variant'].includes(m.status)) {
    return { status: 'auto', key: m.key, candidates: [m.key], reason: '', via: m.status }
  }
  if (m.status === 'hanzi-unique' || m.status === 'ambiguous') {
    return { status: 'resolve', key: null, candidates: m.candidates, reason: m.status, via: m.status }
  }
  const np = normPinyin(card.pinyin)
  const hit = (cccFor(index).get(card.tc) ?? []).find((it) => normPinyin(it.pinyin) === np)
  if (hit) return { status: 'auto', key: hit.key, candidates: [hit.key], reason: '', via: 'ccc' }
  return { status: 'outside', key: null, candidates: [], reason: '', via: 'none' }
}

// Chunks of 200 with a macrotask yield so a 2,000-card file doesn't freeze the UI.
export async function classifyAll(cards, index, onProgress) {
  const out = []
  for (let i = 0; i < cards.length; i += 200) {
    for (const c of cards.slice(i, i + 200)) out.push(classify(c, index))
    onProgress?.(Math.min(i + 200, cards.length), cards.length)
    await new Promise((r) => setTimeout(r))
  }
  return out
}

const CJK = /[　-鿿豈-﫿]/

export function outsideEnglish(defn) {
  const s = String(defn ?? '')
  const at = s.search(CJK)
  const head = (at > 0 ? s.slice(0, at) : s).trim()
  if (head) return head.slice(0, 120)
  return s.trim().slice(0, 60)
}

export const outsideKey = (card) => `${card.tc}|${card.pinyin}`

export const DEFAULT_CATEGORY = 'Pleco'

// decisions: [{ card, kind: 'key'|'outside'|'skip', key? }]. Returns the new progress.
// Lists are unioned with any existing list (never removing keys); re-importing changes nothing.
export function applyPlecoImport(progress, decisions, fileName, now = new Date()) {
  const t = now.toISOString()
  const lists = { ...(progress.lists ?? {}) }
  const customItems = { ...(progress.customItems ?? {}) }
  const itemNotes = { ...(progress.itemNotes ?? {}) }
  const byList = new Map() // listId -> { category, keys: [] }

  for (const d of decisions) {
    if (!d || d.kind === 'skip') continue
    const { card } = d
    let key
    if (d.kind === 'key') {
      key = d.key
    } else {
      key = outsideKey(card)
      if (!customItems[key]) {
        customItems[key] = {
          key, type: 'word', hanzi: card.tc, pinyin: card.pinyin, english: outsideEnglish(card.defn),
          band: null, tags: ['outside-TOCFL'], source: 'pleco', createdAt: t, updatedAt: t,
        }
      }
    }
    if (!key) continue

    const cats = card.categories.length ? card.categories : [DEFAULT_CATEGORY]
    const prev = itemNotes[key]?.pleco
    const pleco = {
      defn: card.defn.slice(0, 400),
      dictref: card.dictref,
      categories: [...new Set([...(prev?.categories ?? []), ...card.categories])],
    }
    if (!prev || prev.defn !== pleco.defn || prev.dictref !== pleco.dictref || pleco.categories.length !== prev.categories.length) {
      itemNotes[key] = { ...(itemNotes[key] ?? {}), pleco, updatedAt: t }
    }

    for (const cat of cats) {
      const id = `pleco:${cat}`
      if (!byList.has(id)) byList.set(id, { category: cat, keys: [] })
      byList.get(id).keys.push(key)
    }
  }

  for (const [id, { category, keys }] of byList) {
    const ex = lists[id] && !lists[id].deleted ? lists[id] : null
    const have = new Set(ex?.itemKeys ?? [])
    const add = [...new Set(keys)].filter((k) => !have.has(k))
    if (ex) {
      if (add.length) lists[id] = { ...ex, itemKeys: [...ex.itemKeys, ...add], updatedAt: t }
    } else {
      lists[id] = {
        id, name: category, sourceType: 'pleco', source: { category, importedAt: t, fileName: fileName ?? '' },
        itemKeys: add, createdAt: t, updatedAt: t,
      }
    }
  }

  return { ...progress, lists, customItems, itemNotes }
}

// Keys added by an import: per-category new-word counts, for the summary line.
export function newKeysByList(before, after) {
  const out = {}
  for (const [id, l] of Object.entries(after.lists ?? {})) {
    if (l.sourceType !== 'pleco' || l.deleted) continue
    const had = new Set(before.lists?.[id]?.deleted ? [] : before.lists?.[id]?.itemKeys ?? [])
    const added = l.itemKeys.filter((k) => !had.has(k))
    if (added.length || !before.lists?.[id]) out[id] = { name: l.name, added }
  }
  return out
}
