// Review-log archive (DESIGN §5.2a, §8.5). Old log entries move from progress.log to
// log/YYYY-MM.json in the data repo. Nothing is dropped: the watermark advances and entries
// leave progress.log only after every month file has been written.
//
// The pure parts import nothing browser-only, so scripts/check-log-archive.mjs runs under Node.
// The GitHub-backed io is loaded lazily for the same reason.

import { localDate } from './dates.js'

const DAY = 86400000
export const DEFAULT_KEEP_DAYS = 90
const FORMAT = 'tocfl-tutor.review-log'

const idOf = (e) => `${e.key}\u0000${e.at}`
const byAt = (a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)

function union(...lists) {
  const seen = new Set()
  const out = []
  for (const list of lists) {
    for (const e of list ?? []) {
      const id = idOf(e)
      if (seen.has(id)) continue
      seen.add(id)
      out.push(e)
    }
  }
  return out.sort(byAt)
}

// Entries older than keepDays (or at/below the existing watermark) grouped by local month.
// → { months: { 'YYYY-MM': entries[] }, newWatermark, count }. newWatermark never moves back.
export function planArchive(progress, now = new Date(), keepDays = DEFAULT_KEEP_DAYS) {
  const tz = progress?.studySettings?.timeZone ?? 'Asia/Taipei'
  const old = progress?.logArchive?.watermark ?? null
  const cutoff = new Date(now.getTime() - keepDays * DAY).toISOString()
  const months = {}
  let newWatermark = old
  let count = 0
  for (const e of progress?.log ?? []) {
    if (!(e.at < cutoff || (old && e.at <= old))) continue
    const m = localDate(new Date(e.at), tz).slice(0, 7)
    ;(months[m] ||= []).push(e)
    if (!newWatermark || e.at > newWatermark) newWatermark = e.at
    count++
  }
  for (const m of Object.keys(months)) months[m].sort(byAt)
  return { months, newWatermark, count }
}

async function defaultIo(cfg) {
  const [{ fetchProgress, putTextFile }, { dataPath }] = await Promise.all([import('./github.js'), import('./dataMode.js')])
  return {
    async read(month) {
      const { data, sha } = await fetchProgress({ ...cfg, path: dataPath(`log/${month}.json`) })
      return { entries: data?.entries ?? [], sha }
    },
    async write(month, entries, sha) {
      const text = JSON.stringify({ format: FORMAT, month, entries })
      await putTextFile(cfg, dataPath(`log/${month}.json`), text, sha || undefined, `chore: archive review log ${month}`)
    },
  }
}

// → { progress, archived, error }. On any failure `progress` is the input, unchanged.
// `io` ({ read(month) → { entries, sha }, write(month, entries, sha) }) defaults to the data repo.
export async function archiveLog(cfg, progress, now = new Date(), io = null) {
  const keepDays = progress?.studySettings?.logKeepDays ?? DEFAULT_KEEP_DAYS
  const plan = planArchive(progress, now, keepDays)
  if (!plan.count) return { progress, archived: 0, error: null }
  try {
    const store = io ?? (await defaultIo(cfg))
    for (const [month, entries] of Object.entries(plan.months)) {
      const { entries: existing, sha } = await store.read(month)
      await store.write(month, union(existing, entries), sha)
    }
  } catch (e) {
    return { progress, archived: 0, error: e.message ?? String(e) }
  }
  const archivedIds = new Set(Object.values(plan.months).flat().map(idOf))
  const months = [...new Set([...(progress.logArchive?.months ?? []), ...Object.keys(plan.months)])].sort()
  return {
    progress: {
      ...progress,
      log: progress.log.filter((e) => !archivedIds.has(idOf(e))),
      logArchive: { watermark: plan.newWatermark, months },
    },
    archived: plan.count,
    error: null,
  }
}

// Archive files + progress.log, deduped and sorted. Local mode / no token: progress.log only.
// Throws if an archive file can't be read (a partial log would produce wrong history).
export async function loadFullLog(cfg, progress, io = null) {
  const months = progress?.logArchive?.months ?? []
  if (!months.length || (!io && !cfg?.token)) return union(progress?.log)
  const store = io ?? (await defaultIo(cfg))
  const lists = []
  for (const m of months) lists.push((await store.read(m)).entries)
  return union(...lists, progress?.log)
}
