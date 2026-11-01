// Merge-on-save (DESIGN §7). Pure: no React, no browser APIs, so
// scripts/check-merge.mjs can import it under Node. Both inputs must already
// be migrated. Returns a new object; mutates neither input.

import { isStub } from './migrate.js'

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)

// Later of two ISO strings; null/undefined count as oldest.
export function laterIso(a, b) {
  if (!a) return b ?? null
  if (!b) return a
  return a >= b ? a : b
}

// Pick one of two versions of a record. Later stamp wins; a missing stamp is
// oldest; a tie keeps `a` (local).
function pickLater(a, b, stampField) {
  const sa = a?.[stampField] || ''
  const sb = b?.[stampField] || ''
  return sb > sa ? b : a
}

// Arrays of records keyed by `idField`: per id, the record with the later
// `stampField` wins (tombstones are ordinary records). Order: local first,
// then remote-only records.
export function mergeById(a, b, idField, stampField) {
  const left = Array.isArray(a) ? a : []
  const right = Array.isArray(b) ? b : []
  const out = []
  const index = new Map()
  for (const rec of left) {
    const id = rec?.[idField]
    if (id === undefined) { out.push(rec); continue }
    if (index.has(id)) {
      out[index.get(id)] = pickLater(out[index.get(id)], rec, stampField)
    } else {
      index.set(id, out.length)
      out.push(rec)
    }
  }
  for (const rec of right) {
    const id = rec?.[idField]
    if (id === undefined) { out.push(rec); continue }
    if (index.has(id)) {
      const i = index.get(id)
      out[i] = pickLater(out[i], rec, stampField)
    } else {
      index.set(id, out.length)
      out.push(rec)
    }
  }
  return out
}

// Objects of records keyed by their map key: per key, later `stampField` wins.
export function mergeMap(a, b, stampField) {
  const left = isObj(a) ? a : {}
  const right = isObj(b) ? b : {}
  const out = { ...left }
  for (const [k, rec] of Object.entries(right)) {
    out[k] = k in left ? pickLater(left[k], rec, stampField) : rec
  }
  return out
}

// A collection that may be an array (records with `id`) or a map (keyed).
function mergeCollection(a, b, stampField = 'updatedAt') {
  if (Array.isArray(a) || Array.isArray(b)) return mergeById(a, b, 'id', stampField)
  return mergeMap(a, b, stampField)
}

function mergeCards(a, b, loggedKeys) {
  const left = isObj(a) ? a : {}
  const right = isObj(b) ? b : {}
  const out = {}
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const x = left[key]
    const y = right[key]
    let card
    if (!x) card = y
    else if (!y) card = x
    else {
      const lx = x.last_review || ''
      const ly = y.last_review || ''
      if (lx !== ly) card = ly > lx ? y : x
      else card = (y.reps ?? 0) > (x.reps ?? 0) ? y : x
      const firsts = [x.firstSeen, y.firstSeen].filter(Boolean).sort()
      const firstSeen = firsts.length ? firsts[0] : (x.firstSeen ?? y.firstSeen)
      if (firstSeen !== undefined && card.firstSeen !== firstSeen) card = { ...card, firstSeen }
    }
    // Drop stubs so an old app version re-creating them can't bring them back.
    if (isStub(card, key, loggedKeys)) continue
    out[key] = card
  }
  return out
}

function mergeLog(a, b, watermark) {
  const seen = new Set()
  const out = []
  for (const e of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    const id = `${e.key}\u0000${e.at}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push(e)
  }
  out.sort((p, q) => (p.at < q.at ? -1 : p.at > q.at ? 1 : 0)) // stable
  return watermark ? out.filter((e) => !(e.at <= watermark)) : out
}

function mergeLogArchive(a, b) {
  const months = new Map()
  for (const m of [...(a?.months || []), ...(b?.months || [])]) months.set(JSON.stringify(m), m)
  const sorted = [...months.values()].sort((p, q) => {
    const sp = typeof p === 'string' ? p : JSON.stringify(p)
    const sq = typeof q === 'string' ? q : JSON.stringify(q)
    return sp < sq ? -1 : sp > sq ? 1 : 0
  })
  return { ...(b || {}), ...(a || {}), watermark: laterIso(a?.watermark, b?.watermark), months: sorted }
}

function mergeMigrations(a, b) {
  const seen = new Set()
  const out = []
  for (const m of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    const id = `${m.from}|${m.to}|${m.at}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push(m)
  }
  return out
}

function mergeContextArchive(a, b) {
  if (!b) return a
  if (!a) return b
  const wa = a.watermark || ''
  const wb = b.watermark || ''
  return wb > wa ? b : a // equal → local
}

const HANDLED = new Set([
  'schemaVersion', 'updatedAt', 'cards', 'log', 'logArchive', 'snapshots', 'studySettings',
  'goals', 'lists', 'customItems', 'itemNotes', 'exerciseFiles', 'sessions', 'manualEntries',
  'sentences', 'testRuns', 'exerciseFlags', 'attempts', 'contextArchive', 'migrations',
])

export function mergeProgress(local, remote) {
  if (!remote) return local
  if (!local) return remote

  const logArchive = mergeLogArchive(local.logArchive, remote.logArchive)
  const logWatermark = logArchive.watermark
  const unionLoggedKeys = new Set([...(local.log || []), ...(remote.log || [])].map((e) => e.key))
  const attemptWatermark = laterIso(local.contextArchive?.watermark, remote.contextArchive?.watermark)

  const attempts = mergeById(local.attempts, remote.attempts, 'id', 'at')
  const merged = {
    schemaVersion: Math.max(local.schemaVersion ?? 0, remote.schemaVersion ?? 0),
    updatedAt: laterIso(local.updatedAt, remote.updatedAt),
    cards: mergeCards(local.cards, remote.cards, unionLoggedKeys),
    log: mergeLog(local.log, remote.log, logWatermark),
    logArchive,
    snapshots: mergeById(local.snapshots, remote.snapshots, 'date', 'computedAt'),
    studySettings: pickLater(local.studySettings, remote.studySettings, 'updatedAt') ?? local.studySettings,
    goals: mergeCollection(local.goals, remote.goals),
    lists: mergeCollection(local.lists, remote.lists),
    customItems: mergeCollection(local.customItems, remote.customItems),
    itemNotes: mergeCollection(local.itemNotes, remote.itemNotes),
    exerciseFiles: mergeCollection(local.exerciseFiles, remote.exerciseFiles),
    sessions: mergeCollection(local.sessions, remote.sessions),
    manualEntries: mergeCollection(local.manualEntries, remote.manualEntries),
    sentences: mergeCollection(local.sentences, remote.sentences),
    testRuns: mergeCollection(local.testRuns, remote.testRuns),
    exerciseFlags: mergeMap(local.exerciseFlags, remote.exerciseFlags, 'at'),
    attempts: attemptWatermark ? attempts.filter((x) => !(x.at <= attemptWatermark)) : attempts,
    contextArchive: mergeContextArchive(local.contextArchive, remote.contextArchive),
    migrations: mergeMigrations(local.migrations, remote.migrations),
  }

  // Unknown top-level keys (including `grammar` until its phase defines a
  // rule): union, remote wins on conflict.
  for (const src of [local, remote]) {
    for (const k of Object.keys(src)) if (!HANDLED.has(k)) merged[k] = src[k]
  }
  return merged
}
