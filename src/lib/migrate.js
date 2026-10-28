// progress.json migration to schema v3 (DESIGN §6.1). Pure: no React, no
// browser APIs, so scripts/check-migration.mjs can import it under Node.

import { CURRENT_SCHEMA, emptyCollections, freshV3 } from './schema.js'

// An empty placeholder card: never rated, never logged. The only cards the
// migration is allowed to remove (CLAUDE.md approved exception).
export function isStub(card, key, loggedKeys) {
  return (card?.reps ?? 0) === 0 && !card?.last_review && (card?.lapses ?? 0) === 0 && !loggedKeys.has(key)
}

// Fills missing v3 collections only; never overwrites anything present.
function ensureV3Shape(p) {
  const out = { ...p }
  const defaults = { cards: {}, log: [], ...emptyCollections() }
  for (const [k, v] of Object.entries(defaults)) {
    if (out[k] === undefined || out[k] === null) out[k] = v
  }
  return out
}

export function migrate(p, { now = new Date().toISOString(), device = '' } = {}) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return freshV3()
  if (p.schemaVersion > CURRENT_SCHEMA) {
    throw new Error(
      `progress.json is from a newer app version (schemaVersion ${p.schemaVersion}). Reload the app.`
    )
  }
  if (p.schemaVersion === CURRENT_SCHEMA) return ensureV3Shape(p)

  const from = p.schemaVersion ?? 2
  const out = { ...p }
  out.schemaVersion = CURRENT_SCHEMA

  const log = Array.isArray(p.log) ? p.log : []
  const loggedKeys = new Set(log.map((e) => e.key))
  const firstLogAt = {}
  for (const e of log) {
    if (e.at && (firstLogAt[e.key] === undefined || e.at < firstLogAt[e.key])) firstLogAt[e.key] = e.at
  }

  out.cards = {}
  let removedStubs = 0
  for (const [key, card] of Object.entries(p.cards || {})) {
    if (isStub(card, key, loggedKeys)) {
      removedStubs++
      continue
    }
    const copy = { ...card }
    if (copy.reps > 0 && copy.firstSeen === undefined) {
      copy.firstSeen = firstLogAt[key] ?? copy.last_review ?? null
    }
    out.cards[key] = copy
  }
  out.log = log

  for (const [k, v] of Object.entries(emptyCollections())) {
    if (out[k] === undefined || out[k] === null) out[k] = v
  }
  out.migrations = [
    ...out.migrations,
    { from, to: CURRENT_SCHEMA, at: now, backupPath: null, device, removedStubs },
  ]
  return out
}

// True when the remote file is pre-v3 (or has no schemaVersion) and so must be
// backed up before the first v3 save (DESIGN §6.2).
export function needsPreV3Backup(remoteRaw) {
  if (remoteRaw === null || remoteRaw === undefined) return false
  let parsed = remoteRaw
  if (typeof remoteRaw === 'string') {
    try {
      parsed = JSON.parse(remoteRaw)
    } catch {
      return false
    }
  }
  if (!parsed || typeof parsed !== 'object') return false
  return !(parsed.schemaVersion >= CURRENT_SCHEMA)
}
