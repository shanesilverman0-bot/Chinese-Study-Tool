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
