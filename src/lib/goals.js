// Goal housekeeping (DESIGN §5.5). Pure.

import { EPOCH_STAMP } from './schema.js'

// The June and Jul–Dec placeholders were replaced by the exam comparison (Phase 5b).
const PLACEHOLDER_IDS = ['goal-jun-2027', 'goal-dec-2027']

// Tombstones the two retired default goals, but only while their updatedAt is still the
// epoch default (never edited). Returns the same object when there is nothing to do.
export function retirePlaceholderGoals(progress, now = new Date()) {
  const goals = progress?.goals
  if (!Array.isArray(goals)) return progress
  const stamp = (now instanceof Date ? now : new Date(now)).toISOString()
  let changed = false
  const next = goals.map((g) => {
    if (!PLACEHOLDER_IDS.includes(g.id) || g.deleted) return g
    if (g.updatedAt !== EPOCH_STAMP) return g
    changed = true
    return { ...g, deleted: true, updatedAt: stamp }
  })
  return changed ? { ...progress, goals: next } : progress
}
