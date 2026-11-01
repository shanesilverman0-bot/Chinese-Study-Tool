// Item keys (DESIGN §4.1). Word keys are `${hanzi}|${pinyin}`; grammar keys are
// `g:${slug}` and never contain `|`.

export const GRAMMAR_PREFIX = 'g:'

export function itemTypeOf(key) {
  return typeof key === 'string' && key.startsWith(GRAMMAR_PREFIX) ? 'grammar' : 'word'
}

export function isWordKey(key) {
  return itemTypeOf(key) === 'word' && typeof key === 'string' && key.includes('|')
}

// ─── Phase 3: item registry, TOCFL matching, baseline sets (DESIGN §4.2–4.3, §8.2) ─

// Compare pinyin ignoring case, spaces, apostrophes, hyphens and middle dots.
export function normPinyin(p) {
  return String(p ?? '').normalize('NFC').toLowerCase().replace(/[\s'’\-·]/g, '')
}

const isNameRow = (row) => (row.tags ?? []).some((t) => String(t).toLowerCase() === 'name')

const posParts = (pos) => String(pos ?? '').split('/').map((s) => s.trim()).filter(Boolean)

// (book, chapter) ordering, lexicographic.
const cmpChapter = (a, b) => (a.book - b.book) || (a.chapter - b.chapter)

export function buildItemIndex({ tocfl = [], ccc = [], customItems = {}, grammar = [] } = {}) {
  const items = new Map()
  const tocflKeys = new Set()
  const byHanzi = new Map() // hanzi (incl. variant forms) -> Set of MAIN-sense keys
  const exactMap = new Map() // `${hanzi}|${pinyin}` -> main key (main form + variants)
  const normMap = new Map() // `${hanzi}|${normPinyin(pinyin)}` -> main key
  const partMap = new Map() // same, per `/`-separated reading
  const aliases = new Map() // tocflKey -> Set of other item keys that count as it
  const rawAliases = new Map() // item key -> raw CCC hanzi|pinyin keys that now study as it
  const addTo = (map, k, v) => { if (!map.has(k)) map.set(k, v) }
  const addHanzi = (h, mainKey) => {
    if (!byHanzi.has(h)) byHanzi.set(h, new Set())
    byHanzi.get(h).add(mainKey)
  }

  for (const v of tocfl) {
    items.set(v.key, {
      key: v.key, type: 'word', hanzi: v.hanzi, pinyin: v.pinyin, english: v.english,
      glossSource: v.glossSource, level: v.level ?? null, band: (Array.isArray(v.band) ? v.band[0] : v.band) ?? null,
      pos: v.pos, senseOf: v.senseOf, senses: v.senses, variants: v.variants, tocflId: v.tocflId,
      inTocfl: true, tocflKey: v.key, ccc: [], sources: ['tocfl'], tags: [],
    })
    tocflKeys.add(v.key)
    if (v.senseOf) continue
    const forms = [{ hanzi: v.hanzi, pinyin: v.pinyin }, ...(v.variants ?? [])]
    for (const f of forms) {
      addHanzi(f.hanzi, v.key)
      addTo(exactMap, `${f.hanzi}|${f.pinyin}`, v.key)
      addTo(normMap, `${f.hanzi}|${normPinyin(f.pinyin)}`, v.key)
      for (const part of String(f.pinyin).split('/')) addTo(partMap, `${f.hanzi}|${normPinyin(part)}`, v.key)
    }
  }

  // DESIGN §4.3 tiers. `key` is the MAIN-sense key of the matched TOCFL word.
  function match(hanzi, pinyin) {
    const hit = (status, key) => ({ status, key, candidates: [key] })
    let k = exactMap.get(`${hanzi}|${pinyin}`)
    if (k) return hit('exact', k)
    const np = normPinyin(pinyin)
    k = normMap.get(`${hanzi}|${np}`)
    if (k) return hit('normalized', k)
    k = partMap.get(`${hanzi}|${np}`)
    if (k) return hit('variant', k)
    const cands = [...(byHanzi.get(hanzi) ?? [])]
    if (cands.length === 1) return hit('hanzi-unique', cands[0])
    if (cands.length > 1) return { status: 'ambiguous', key: null, candidates: cands }
    return { status: 'none', key: null, candidates: [] }
  }

  // The sense of a matched word whose POS fits `pos` (equal, or inside a `/` list).
  function pickSense(mainKey, pos) {
    const main = items.get(mainKey)
    if (!main || !pos) return mainKey
    const want = posParts(pos)
    const fits = (it) => posParts(it.pos).some((p) => want.includes(p))
    if (fits(main)) return mainKey
    for (const sk of main.senses ?? []) {
      const s = items.get(sk)
      if (s && fits(s)) return sk
    }
    return mainKey
  }

  // Per CCC row: its item key, TOCFL key and match status. Cached on the row object.
  const rowCache = new WeakMap()
  function rowInfo(row) {
    let info = rowCache.get(row)
    if (info) return info
    const raw = `${row.hanzi}|${row.pinyin}`
    if (isNameRow(row)) {
      info = { key: raw, tocflKey: null, status: 'name' }
    } else {
      const m = match(row.hanzi, row.pinyin)
      if (m.key) {
        const sense = pickSense(m.key, row.pos)
        // exact/normalized/variant rows are the TOCFL word; hanzi-unique ones stay their own item
        const same = m.status !== 'hanzi-unique'
        info = { key: same ? sense : raw, tocflKey: sense, status: m.status }
      } else {
        info = { key: raw, tocflKey: null, status: m.status }
      }
    }
    rowCache.set(row, info)
    return info
  }

  const addAlias = (tocflKey, key) => {
    if (!tocflKey || tocflKey === key) return
    if (!aliases.has(tocflKey)) aliases.set(tocflKey, new Set())
    aliases.get(tocflKey).add(key)
  }

  for (const row of ccc) {
    if (!row.hanzi) continue
    const info = rowInfo(row)
    const loc = { book: row.book, chapter: row.chapter, part: row.list ?? row.part ?? null }
    let it = items.get(info.key)
    if (!it) {
      it = {
        key: info.key, type: 'word', hanzi: row.hanzi, pinyin: row.pinyin, english: row.english,
        level: null, band: null, pos: row.pos, inTocfl: false, tocflKey: info.tocflKey,
        ccc: [], sources: [], tags: [],
      }
      items.set(info.key, it)
    }
    it.ccc.push(loc)
    if (!it.sources.includes('ccc')) it.sources.push('ccc')
    if (info.status === 'name' && !it.tags.includes('name')) it.tags.push('name')
    addAlias(info.tocflKey, info.key)
    // keep the raw hanzi|pinyin of the row resolvable (existing cards use it)
    const raw = `${row.hanzi}|${row.pinyin}`
    if (raw !== info.key && !items.has(raw)) {
      items.set(raw, {
        key: raw, type: 'word', hanzi: row.hanzi, pinyin: row.pinyin, english: row.english,
        level: null, band: null, pos: row.pos, inTocfl: false, tocflKey: info.tocflKey,
        rawAliasOf: info.key, // this row now studies as info.key; older cards may sit here
        ccc: [loc], sources: ['ccc'], tags: [],
      })
      addAlias(info.tocflKey, raw)
      if (!rawAliases.has(info.key)) rawAliases.set(info.key, new Set())
      rawAliases.get(info.key).add(raw)
    }
  }

  for (const [key, c] of Object.entries(customItems ?? {})) {
    if (items.has(key)) {
      const it = items.get(key)
      if (!it.sources.includes(c.source ?? 'custom')) it.sources.push(c.source ?? 'custom')
      continue
    }
    const m = c.hanzi ? match(c.hanzi, c.pinyin) : { status: 'none', key: null }
    const accepted = ['exact', 'normalized', 'variant'].includes(m.status)
    const tk = accepted ? pickSense(m.key, c.pos) : null
    items.set(key, {
      key, type: 'word', hanzi: c.hanzi, pinyin: c.pinyin, english: c.english ?? '',
      level: null, band: null, inTocfl: false, tocflKey: tk, ccc: [],
      sources: [c.source ?? 'custom'], tags: c.tags ?? [],
    })
    addAlias(tk, key)
  }

  for (const g of grammar) {
    items.set(g.key, { type: 'grammar', inTocfl: false, tocflKey: null, ccc: [], sources: ['grammar'], tags: [], ...g })
  }

  // earliest (book, chapter) among the CCC rows that count as this TOCFL key
  const firstChapters = new Map()
  for (const row of ccc) {
    const { tocflKey } = rowInfo(row)
    if (!tocflKey || row.book == null || row.chapter == null) continue
    const cur = firstChapters.get(tocflKey)
    if (!cur || cmpChapter(row, cur) < 0) firstChapters.set(tocflKey, { book: row.book, chapter: row.chapter })
  }

  return {
    get: (key) => items.get(key),
    all: () => [...items.values()],
    tocflKeys,
    byHanzi,
    match,
    pickSense,
    rowInfo,
    aliasesOf: (tocflKey) => [...(aliases.get(tocflKey) ?? [])],
    // The card key to study `key` under (DESIGN §4.3): `key` itself if it has a card,
    // else a raw CCC key that now maps to it and already has a reviewed card (latest
    // review wins), so history recorded under the old CCC spelling keeps being used.
    studyKeyOf(key, cards = {}) {
      if ((cards[key]?.reps ?? 0) > 0) return key
      let best = null
      for (const r of rawAliases.get(key) ?? []) {
        const c = cards[r]
        if (c && (c.reps ?? 0) > 0 && (!best || (c.last_review ?? '') > (cards[best].last_review ?? ''))) best = r
      }
      return best ?? key
    },
    firstChapterOf: (tocflKey) => firstChapters.get(tocflKey) ?? null,
  }
}

// DESIGN §8.2: each TOCFL key belongs to the tier of the first CCC chapter that lists it.
// Bounds are inclusive. Name rows and unmatched/ambiguous rows never count.
export function baselineSets(index, cccEntries, baseline) {
  const solid = new Set()
  const studied = new Set()
  if (!baseline || baseline.enabled === false) return { solid, studied }
  const first = new Map()
  for (const row of cccEntries) {
    const { tocflKey } = index.rowInfo(row)
    if (!tocflKey || row.book == null || row.chapter == null) continue
    const cur = first.get(tocflKey)
    if (!cur || cmpChapter(row, cur) < 0) first.set(tocflKey, { book: row.book, chapter: row.chapter })
  }
  for (const [k, ch] of first) {
    if (cmpChapter(ch, baseline.solidThrough) <= 0) solid.add(k)
    else if (cmpChapter(ch, baseline.studiedThrough) <= 0) studied.add(k)
  }
  return { solid, studied }
}
