// The study picker's selection, persisted per device (DESIGN §9.3, Phase 8).

import { storageKey } from './dataMode.js'
import { EMPTY_SELECTION } from './queue.js'
import { cccChapterId, cccPartId } from './lists.js'

const SELECTION_KEY = storageKey('selection')
const OLD_FILTER_KEY = storageKey('studyFilter')

const numOrNull = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' && Number(v) > 0 ? Math.floor(Number(v)) : null)

function clean(s) {
  return {
    listIds: Array.isArray(s?.listIds) ? s.listIds.filter((x) => typeof x === 'string') : [],
    tocflLevels: Array.isArray(s?.tocflLevels) ? s.tocflLevels.filter((x) => typeof x === 'string') : [],
    includeBaseline: s?.includeBaseline === true,
    size: numOrNull(s?.size),
    newMax: numOrNull(s?.newMax),
  }
}

// One-time conversion of the old study filter (bands + CCC book/chapter/list). The old key stays.
function convertOld(cccChapters) {
  const raw = localStorage.getItem(OLD_FILTER_KEY)
  if (!raw) return null
  const old = JSON.parse(raw)
  const sel = { ...EMPTY_SELECTION, listIds: [], tocflLevels: [] }
  const t = { ...(old.tocfl ?? {}) }
  for (const [band, levels] of [['A', ['A1', 'A2']], ['B', ['B1', 'B2']]]) {
    if (t[band] === true) for (const l of levels) if (t[l] === undefined) t[l] = true
  }
  for (const l of ['Novice', 'A1', 'A2', 'B1', 'B2', 'C']) if (t[l] === true) sel.tocflLevels.push(l)
  for (const [k, on] of Object.entries(old.cccc ?? {})) {
    if (on !== true) continue
    const [book, chapter, part] = k.split('-')
    if (book && chapter && part) sel.listIds.push(cccPartId(book, chapter, part))
  }
  const d = old.dangdai
  if (d && d.book != null) {
    if (d.chapter != null) sel.listIds.push(d.list != null ? cccPartId(d.book, d.chapter, d.list) : cccChapterId(d.book, d.chapter))
    else for (const ch of cccChapters) if (ch.book === Number(d.book)) sel.listIds.push(cccChapterId(ch.book, ch.chapter))
  }
  return sel
}

// cccChapters: [{ book, chapter }] for the whole-book conversion.
export function loadSelection(cccChapters = []) {
  try {
    const raw = localStorage.getItem(SELECTION_KEY)
    if (raw) return clean(JSON.parse(raw))
    const converted = convertOld(cccChapters)
    if (converted) return clean(converted)
  } catch { /* private mode or bad JSON */ }
  return clean(EMPTY_SELECTION)
}

export function saveSelection(sel) {
  try { localStorage.setItem(SELECTION_KEY, JSON.stringify(sel)) } catch { /* private mode */ }
}
