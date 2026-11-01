// Context exercises: question refs, practice picking, attempt log (DESIGN §5.11–5.12, §11.2).

export const questionRef = (fileId, exId, q) => `${fileId}#${exId}#${q}`

// files: [{ meta, json }] → [{ ref, fileId, exId, q, type, key }]. Disabled questions are skipped.
export function questionRefs(files, flags = {}) {
  const out = []
  for (const { meta, json } of files) {
    for (const ex of json?.exercises ?? []) {
      ;(ex.questions ?? []).forEach((qu, q) => {
        const ref = questionRef(meta.id, ex.id, q)
        if (flags?.[ref]?.status === 'disabled') return
        out.push({ ref, fileId: meta.id, exId: ex.id, q, type: ex.type, key: qu.target ?? ex.targets?.[0] ?? '' })
      })
    }
  }
  return out
}

function shuffle(a) {
  const x = [...a]
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[x[i], x[j]] = [x[j], x[i]]
  }
  return x
}

// types: array of exercise types, or null/empty for all. count: number or null (all).
// Order: fewest attempts on the target item first, ties random (gap list joins in Phase 14).
export function pickPracticeQuestions({ refs, progress, types, count = 20 }) {
  const n = new Map()
  for (const a of progress?.attempts ?? []) n.set(a.key, (n.get(a.key) ?? 0) + 1)
  const pool = types?.length ? refs.filter((r) => types.includes(r.type)) : refs
  const sorted = shuffle(pool).sort((a, b) => (n.get(a.key) ?? 0) - (n.get(b.key) ?? 0))
  return count == null ? sorted : sorted.slice(0, count)
}

export function recordAttempt(progress, attempt) {
  return { ...progress, attempts: [...(progress.attempts ?? []), attempt] }
}

const DAY = 86400000
const ROLLUP_KEEP_DAYS = 60
const ROLLUP_HEADROOM = 500

// DESIGN §11.4. Pure. When attempts exceed attemptLogMax, fold attempts older than 60 days
// (oldest first) into contextArchive until length <= max - 500 or none that old remain.
export function rollupAttempts(progress, now = new Date()) {
  const attempts = progress?.attempts ?? []
  const max = progress?.studySettings?.attemptLogMax ?? 3000
  if (attempts.length <= max) return progress
  const cutoff = new Date(now).getTime() - ROLLUP_KEEP_DAYS * DAY
  const sorted = [...attempts].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  const target = max - ROLLUP_HEADROOM
  let n = 0
  while (n < sorted.length && sorted.length - n > target && new Date(sorted[n].at).getTime() < cutoff) n++
  if (n === 0) return progress
  // The watermark drops everything at or before it, so never split a run of equal timestamps.
  while (n < sorted.length && sorted[n].at === sorted[n - 1].at) n++
  const folded = sorted.slice(0, n)

  const prev = progress.contextArchive ?? { watermark: null, items: {} }
  const items = { ...prev.items }
  for (const a of folded) {
    const it = items[a.key] = items[a.key] ? cloneItem(items[a.key]) : { n: 0, c: 0, byType: {}, exCorrect: [] }
    it.n++
    const bt = it.byType[a.type] ?? (it.byType[a.type] = [0, 0])
    bt[0]++
    if (a.correct) {
      it.c++
      bt[1]++
      const ex = `${a.fileId}#${a.exId}`
      if (it.exCorrect.length < 10 && !it.exCorrect.includes(ex)) it.exCorrect.push(ex)
    }
  }
  return {
    ...progress,
    attempts: sorted.slice(n),
    contextArchive: { watermark: folded[folded.length - 1].at, items },
  }
}

function cloneItem(it) {
  return {
    n: it.n, c: it.c,
    byType: Object.fromEntries(Object.entries(it.byType ?? {}).map(([t, v]) => [t, [...v]])),
    exCorrect: [...(it.exCorrect ?? [])],
  }
}
