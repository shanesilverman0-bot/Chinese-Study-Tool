// Sentence writing and grading (DESIGN §5.17, §12). Pure: no React, no browser APIs.

import { newId } from './ids.js'
import { localDate } from './dates.js'

export const PACKET_FORMAT = 'tocfl-tutor.sentence-packet'
export const GRADES_FORMAT = 'tocfl-tutor.sentence-grades'

// A new queued entry for `word` (any object with hanzi/pinyin/english, or a bare key via `key`).
export function makeSentence({ key, sentence, now = new Date().toISOString() }) {
  return {
    id: newId('s'), key, sentence: sentence.trim(), at: now,
    status: 'queued', exportedAt: null, grade: null, updatedAt: now,
  }
}

export const queuedOf = (sentences) => (sentences ?? []).filter((s) => !s.deleted && s.status === 'queued')
export const countBy = (sentences, status) => (sentences ?? []).filter((s) => !s.deleted && s.status === status).length

// Latest graded entry for a key (by gradedAt), or null.
export function latestGraded(sentences, key) {
  let best = null
  for (const s of sentences ?? []) {
    if (s.deleted || s.key !== key || s.status !== 'graded' || !s.grade) continue
    if (!best || (s.grade.gradedAt ?? '') > (best.grade.gradedAt ?? '')) best = s
  }
  return best
}

// Packet of all queued entries. `lookup(key)` → { hanzi, pinyin, english } (items index entry), or undefined.
export function buildPacket(sentences, lookup, { now = new Date(), tz } = {}) {
  const items = queuedOf(sentences).map((s) => {
    const it = lookup(s.key) ?? {}
    const [h, p] = s.key.split('|')
    return {
      id: s.id, key: s.key,
      hanzi: it.hanzi ?? h, pinyin: it.pinyin ?? (p ? p.split('#')[0] : ''), english: it.english ?? '',
      sentence: s.sentence, date: localDate(new Date(s.at), tz),
    }
  })
  return { format: PACKET_FORMAT, formatVersion: 1, exportedAt: now.toISOString(), items }
}

export const packetFileName = (now = new Date(), tz) => `sentences_${localDate(now, tz)}.json`

// Parse the grader's reply. → { results } | { error }
export function parseGrades(text) {
  const a = text.indexOf('{')
  const b = text.lastIndexOf('}')
  if (a < 0 || b <= a) return { error: 'No JSON object found in the pasted text.' }
  let json
  try { json = JSON.parse(text.slice(a, b + 1)) } catch (e) { return { error: `Not valid JSON: ${e.message}` } }
  if (json.format !== GRADES_FORMAT) return { error: `Expected format "${GRADES_FORMAT}".` }
  if (!Array.isArray(json.results)) return { error: 'The file has no "results" array.' }
  return { results: json.results }
}

// Apply grade results to progress. Re-grading overwrites the grade and replaces the attempt
// (same id a_sent_<entry.id>), so a sentence never counts twice.
// → { next, report: { graded, unknown, invalid } }
export function applyGradesTo(progress, results, now = new Date().toISOString()) {
  const byId = new Map((progress.sentences ?? []).map((s) => [s.id, s]))
  const grades = new Map()
  let unknown = 0
  let invalid = 0
  for (const r of results) {
    const e = byId.get(r?.id)
    if (!e || e.deleted) { unknown++; continue }
    if (typeof r.correct !== 'boolean' || typeof r.natural !== 'boolean') { invalid++; continue }
    grades.set(e.id, {
      correct: r.correct, natural: r.natural,
      corrected: typeof r.corrected === 'string' ? r.corrected : e.sentence,
      note: typeof r.note === 'string' ? r.note : '',
      gradedAt: now,
    })
  }
  if (!grades.size) return { next: progress, report: { graded: 0, unknown, invalid } }

  const sentences = (progress.sentences ?? []).map((s) =>
    grades.has(s.id) ? { ...s, status: 'graded', grade: grades.get(s.id), updatedAt: now } : s)
  const attemptIds = new Set([...grades.keys()].map((id) => `a_sent_${id}`))
  const attempts = (progress.attempts ?? []).filter((a) => !attemptIds.has(a.id))
  for (const [id, g] of grades) {
    attempts.push({
      id: `a_sent_${id}`, at: now, fileId: 'sentences', exId: id, q: 0,
      key: byId.get(id).key, type: 'sentence', mode: 'practice', runId: null,
      correct: g.correct, chosen: '', ms: 0,
    })
  }
  return { next: { ...progress, sentences, attempts }, report: { graded: grades.size, unknown, invalid } }
}
