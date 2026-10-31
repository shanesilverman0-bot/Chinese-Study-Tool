// Lists (DESIGN §9.1, §5.7). Pure. CCC lists are virtual (built from the bundled
// packs); pleco and custom lists live in progress.lists, keyed by id.

import { newId } from './ids.js'
import { isKnownCard } from './counts.js'

const PART_ORDER = ['I', 'II', 'III']
const cmpPart = (a, b) => {
  const i = PART_ORDER.indexOf(a)
  const j = PART_ORDER.indexOf(b)
  return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || String(a).localeCompare(String(b))
}

export const cccChapterId = (book, chapter) => `ccc:b${book}c${chapter}`
export const cccPartId = (book, chapter, part) => `ccc:b${book}c${chapter}p${part}`

const cccCache = new WeakMap()

// Virtual lists from CCC rows (each row already carries its item `key`, DESIGN §4.3).
// Every row is kept; items are deduped by key only, in pack order.
export function cccLists(cccVocab) {
  const hit = cccCache.get(cccVocab)
  if (hit) return hit
  const chapters = new Map() // `${book}|${chapter}` -> { book, chapter, keys:Set, parts:Map }
  for (const row of cccVocab) {
    if (row.book == null || row.chapter == null || !row.key) continue
    const ck = `${row.book}|${row.chapter}`
    let ch = chapters.get(ck)
    if (!ch) {
      ch = { book: row.book, chapter: row.chapter, keys: new Set(), parts: new Map() }
      chapters.set(ck, ch)
    }
    ch.keys.add(row.key)
    const part = row.list ?? row.part ?? null
    if (part != null) {
      if (!ch.parts.has(part)) ch.parts.set(part, new Set())
      ch.parts.get(part).add(row.key)
    }
  }
  const out = []
  const sorted = [...chapters.values()].sort((a, b) => a.book - b.book || a.chapter - b.chapter)
  for (const ch of sorted) {
    const base = { sourceType: 'ccc', createdAt: '', updatedAt: '' }
    out.push({
      ...base, id: cccChapterId(ch.book, ch.chapter), name: `當代 B${ch.book} 第${ch.chapter}課`,
      source: { book: ch.book, chapter: ch.chapter }, itemKeys: [...ch.keys],
    })
    for (const part of [...ch.parts.keys()].sort(cmpPart)) {
      out.push({
        ...base, id: cccPartId(ch.book, ch.chapter, part), name: `當代 B${ch.book} 第${ch.chapter}課 ${part}`,
        source: { book: ch.book, chapter: ch.chapter, part }, itemKeys: [...ch.parts.get(part)],
      })
    }
  }
  cccCache.set(cccVocab, out)
  return out
}

const TYPE_ORDER = { ccc: 0, pleco: 1, custom: 2 }

// All lists of all three kinds, one array of the same List shape.
export function getAllLists(progress, cccVocab) {
  const stored = Object.values(progress?.lists ?? {}).filter((l) => l && !l.deleted)
  stored.sort((a, b) => (TYPE_ORDER[a.sourceType] ?? 9) - (TYPE_ORDER[b.sourceType] ?? 9) || String(a.name).localeCompare(String(b.name)))
  return [...cccLists(cccVocab), ...stored]
}

// The editors below return the new list record; the caller stores it with upsertList().
export function createCustomList(name, now = new Date()) {
  const t = now.toISOString()
  return {
    id: `custom:${newId('l')}`, name: String(name).trim() || '未命名', sourceType: 'custom', source: {},
    itemKeys: [], createdAt: t, updatedAt: t,
  }
}

export function addItems(list, keys, now = new Date()) {
  const have = new Set(list.itemKeys)
  const add = keys.filter((k) => !have.has(k))
  return add.length ? { ...list, itemKeys: [...list.itemKeys, ...add], updatedAt: now.toISOString() } : list
}

export function removeItems(list, keys, now = new Date()) {
  const drop = new Set(keys)
  return { ...list, itemKeys: list.itemKeys.filter((k) => !drop.has(k)), updatedAt: now.toISOString() }
}

export function renameList(list, name, now = new Date()) {
  return { ...list, name: String(name).trim() || list.name, updatedAt: now.toISOString() }
}

// Tombstone (DESIGN §7). CCC lists are virtual and can't be deleted.
export function deleteList(list, now = new Date()) {
  if (list.sourceType === 'ccc') return list
  return { ...list, deleted: true, updatedAt: now.toISOString() }
}

const stripTones = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s'’\-·]/g, '')

// Substring match on hanzi, toneless pinyin or english; at most `max` results.
export function searchItems(index, q, max = 50) {
  const needle = String(q ?? '').trim().toLowerCase()
  if (!needle) return []
  const pin = stripTones(needle)
  const out = []
  for (const it of index.all()) {
    if (it.type !== 'word' || it.rawAliasOf) continue
    if (
      (it.hanzi && it.hanzi.includes(needle)) ||
      (pin && stripTones(it.pinyin).includes(pin)) ||
      (it.english && String(it.english).toLowerCase().includes(needle))
    ) {
      out.push(it)
      if (out.length >= max) break
    }
  }
  return out
}

// 'new' | 'learning' | 'known' | 'baseline' for one item key (DESIGN §8.2–8.4).
export function itemStatus(key, { index, cards, baseline, settings }) {
  const sk = index.studyKeyOf(key, cards)
  const tk = index.get(key)?.tocflKey ?? key
  const own = [sk, ...(tk !== sk ? [tk] : []), ...index.aliasesOf(tk)].map((k) => cards[k]).filter((c) => c && c.reps > 0)
  if (own.length === 0) return baseline?.solid?.has(tk) ? 'baseline' : 'new'
  const best = own.reduce((a, b) => ((b.stability ?? 0) > (a.stability ?? 0) ? b : a))
  return isKnownCard(best, settings) ? 'known' : 'learning'
}

// Status counts for a set of item keys (deduped): the bars and due·new·known numbers on
// the Lists page. `known` includes untouched solid-baseline words, as the Today card does;
// `baseline` is that subset. `due` = reviewed items whose study card is due now.
export function statusSummary(keys, { index, cards, baseline, settings }, now = new Date()) {
  const out = { total: 0, known: 0, baseline: 0, learning: 0, fresh: 0, due: 0 }
  const t = now.getTime()
  for (const k of new Set(keys)) {
    out.total++
    const st = itemStatus(k, { index, cards, baseline, settings })
    if (st === 'new') { out.fresh++; continue }
    if (st === 'baseline') { out.known++; out.baseline++; continue }
    if (st === 'known') out.known++
    else out.learning++
    const c = cards[index.studyKeyOf(k, cards)]
    if (c?.due && new Date(c.due).getTime() <= t) out.due++
  }
  return out
}
