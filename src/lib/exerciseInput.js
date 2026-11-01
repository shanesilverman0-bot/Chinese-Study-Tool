// Exercise input export (DESIGN §10.1, §10.2). Pure.

export const TYPES = ['cloze', 'fill', 'usage', 'listening']
const BAND_ORDER = ['Novice', 'A', 'B', 'C']
export const BATCH_SIZE = 20

const keysOf = (list) => (Array.isArray(list) ? list : list?.itemKeys ?? [])

export const listSlug = (listId) => String(listId).replace(/:/g, '_')

// 1-based batch n is batchesOf(list)[n - 1].
export function batchesOf(list) {
  const keys = keysOf(list)
  const out = []
  for (let i = 0; i < keys.length; i += BATCH_SIZE) out.push(keys.slice(i, i + BATCH_SIZE))
  return out
}

// n cloze items → ceil(n/5) passages, sizes as even as possible.
function groupCloze(keys) {
  const groups = Math.ceil(keys.length / 5)
  const base = Math.floor(keys.length / groups)
  const extra = keys.length % groups
  const out = []
  let at = 0
  for (let g = 0; g < groups; g++) {
    const size = base + (g < extra ? 1 : 0)
    out.push(keys.slice(at, at + size))
    at += size
  }
  return out
}

// Type of the item at position i in a batch for variant v (v is 1-based).
export function typeAt(i, variant) {
  return TYPES[(i + variant - 1) % 4]
}

// → [{ type, targets: [key…] }]. Cloze passages first, then fill, usage, listening one entry per item.
export function typePlan(batchKeys, variant) {
  const by = { cloze: [], fill: [], usage: [], listening: [] }
  batchKeys.forEach((k, i) => by[typeAt(i, variant)].push(k))
  // fewer than 3 cloze items can't form a passage: they become fill, kept in batch order
  if (by.cloze.length > 0 && by.cloze.length < 3) {
    const moved = new Set(by.cloze)
    by.cloze = []
    by.fill = batchKeys.filter((k, i) => moved.has(k) || by.fill.includes(k))
  }
  const plan = []
  if (by.cloze.length) for (const g of groupCloze(by.cloze)) plan.push({ type: 'cloze', targets: g })
  for (const t of ['fill', 'usage', 'listening']) for (const k of by[t]) plan.push({ type: t, targets: [k] })
  return plan
}

export function targetBandOf(keys, index) {
  let best = 0
  for (const k of keys) {
    const band = index?.get(k)?.band ?? 'B' // outside-TOCFL items count as B
    best = Math.max(best, Math.max(0, BAND_ORDER.indexOf(band)))
  }
  return BAND_ORDER[best] ?? 'B'
}

const live = (files) => (files ?? []).filter((f) => f && f.exercises)

// existingFiles: parsed contents of already-imported files (any list; filtered here).
export function buildAvoid(existingFiles, listId, batch) {
  const sentences = []
  const distractors = {}
  const seen = new Set()
  const add = (s) => {
    if (typeof s === 'string' && s && !seen.has(s)) { seen.add(s); sentences.push(s) }
  }
  for (const f of live(existingFiles)) {
    if (f.listId !== listId || f.batch !== batch) continue
    for (const ex of f.exercises) {
      add(ex.passage)
      add(ex.sentence)
      add(ex.audioText)
      for (const q of ex.questions ?? []) {
        if (ex.type === 'usage') for (const o of q.options ?? []) add(o)
        if ((ex.type === 'cloze' || ex.type === 'fill') && q.target) {
          const set = (q.options ?? []).filter((o) => o !== q.answer)
          if (set.length) (distractors[q.target] = distractors[q.target] ?? []).push(set)
        }
      }
    }
  }
  return { sentences, distractors }
}

export function buildInputFile({ list, batch, variant, index, existingFiles }) {
  const batches = batchesOf(list)
  const keys = batches[batch - 1] ?? []
  const items = keys.map((k) => {
    const it = index?.get(k)
    const [hz, py] = k.split('|')
    return {
      key: k, hanzi: it?.hanzi ?? hz, pinyin: it?.pinyin ?? py ?? '', english: it?.english ?? '',
      band: it?.band ?? null, pos: it?.pos ?? null,
    }
  })
  return {
    format: 'tocfl-tutor.exercise-input',
    formatVersion: 1,
    listId: list.id,
    listName: list.name,
    batch,
    batchCount: batches.length,
    variant,
    itemType: 'word',
    targetBand: targetBandOf(keys, index),
    idPrefix: `${String(list.id).replace(/:/g, '-')}-b${batch}-v${variant}`,
    items,
    plan: typePlan(keys, variant),
    avoid: buildAvoid(existingFiles, list.id, batch),
  }
}

export const inputFileName = (listId, batch, variant) => `gen-input_${listSlug(listId)}_b${batch}_v${variant}.json`

// Lowest variant (≥1) with no non-deleted file for this list and batch.
export function nextVariant(metas, listId, batch) {
  const used = new Set(
    Object.values(metas ?? {})
      .filter((m) => m && !m.deleted && m.listId === listId && m.batch === batch)
      .map((m) => m.variant)
  )
  let v = 1
  while (used.has(v)) v++
  return v
}
