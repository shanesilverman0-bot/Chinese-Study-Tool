// Flashcard queue (DESIGN §9.4). Pure. No fixed cap: size and new-card limit come
// from the selection.

const LEARNING = 1
const RELEARNING = 3
const RESHOW_WINDOW_MS = 60 * 60 * 1000
const RESHOW_GAP = 5

export const EMPTY_SELECTION = {
  listIds: [], tocflLevels: [], includeBaseline: false, size: null, newMax: null,
}

const isReviewed = (c) => Boolean(c) && (c.reps ?? 0) > 0

// selection: { listIds, tocflLevels, includeBaseline, size, newMax }
// lists: all lists (getAllLists). baseline: { solid, studied } from baselineSets().
export function buildFlashcardQueue({ selection, lists, index, progress, baseline, now = new Date() }) {
  const sel = { ...EMPTY_SELECTION, ...selection }
  const cards = progress?.cards ?? {}
  const byId = new Map(lists.map((l) => [l.id, l]))
  const solid = baseline?.solid ?? new Set()

  // Candidates in selection order. `explicit` = also in a selected Pleco/custom list.
  const order = []
  const entries = new Map() // key -> { explicit }
  const add = (key, explicit) => {
    const e = entries.get(key)
    if (e) { if (explicit) e.explicit = true; return }
    entries.set(key, { explicit })
    order.push(key)
  }
  for (const id of sel.listIds) {
    const l = byId.get(id)
    if (!l) continue
    for (const k of l.itemKeys) add(k, l.sourceType !== 'ccc')
  }
  if (sel.tocflLevels.length) {
    const want = new Set(sel.tocflLevels)
    for (const it of index.all()) if (it.inTocfl && it.type === 'word' && want.has(it.level)) add(it.key, false)
  }

  const seen = new Set()
  const due = []
  const fresh = []
  let baselineSkipped = 0
  for (const key of order) {
    const item = index.get(key)
    if (!item || item.type !== 'word') continue
    const sk = index.studyKeyOf(key, cards)
    if (seen.has(sk)) continue // two keys resolved to the same card
    const card = cards[sk]
    const reviewed = isReviewed(card)
    if (!sel.includeBaseline && !entries.get(key).explicit && !reviewed) {
      const tk = item.tocflKey ?? key
      // untouched = no reviewed card under the key, its study key or any alias
      const touched = isReviewed(cards[tk]) || index.aliasesOf(tk).some((a) => isReviewed(cards[a]))
      if (solid.has(tk) && !touched) {
        seen.add(sk)
        baselineSkipped++
        continue
      }
    }
    seen.add(sk)
    if (reviewed) {
      if (new Date(card.due).getTime() <= now.getTime()) due.push(sk)
    } else {
      fresh.push(sk)
    }
  }
  due.sort((a, b) => (cards[a].due < cards[b].due ? -1 : cards[a].due > cards[b].due ? 1 : 0))
  const freshUsed = sel.newMax != null ? fresh.slice(0, sel.newMax) : fresh
  let queue = [...due, ...freshUsed]
  if (sel.size != null) queue = queue.slice(0, sel.size)
  return {
    queue,
    stats: { due: due.length, fresh: freshUsed.length, freshAvailable: fresh.length, baselineSkipped, total: queue.length },
  }
}

// Learning re-show (DESIGN §9.4): after a rating, a card now in Learning/Relearning that
// is due within 60 minutes returns 5 cards later (or at the end if fewer remain).
// `card` is the card as updated by the rating. Returns a new array (or the same one).
export function requeueAfterRating(queue, pos, key, card, now = new Date()) {
  if (!card || (card.state !== LEARNING && card.state !== RELEARNING)) return queue
  if (new Date(card.due).getTime() - now.getTime() > RESHOW_WINDOW_MS) return queue
  const at = Math.min(pos + RESHOW_GAP, queue.length)
  return [...queue.slice(0, at), key, ...queue.slice(at)]
}
