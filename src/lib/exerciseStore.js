// Exercise file storage (DESIGN §10.5). Contents live in the data repo; metadata in progress.exerciseFiles.
import { DATA_MODE, dataPath, storageKey } from './dataMode.js'
import { putTextFile, readFileContent } from './github.js'
import { listSlug } from './exerciseInput.js'

// FNV-1a 32-bit → first 6 hex chars.
export function shortHash(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0').slice(0, 6)
}

export const fileIdFor = (listId, batch, variant, text) => `${listSlug(listId)}.b${batch}.v${variant}.${shortHash(text)}`

// Path on the data branch, without the dev/ prefix (dataPath adds it when writing).
export const pathFor = (listId, fileId) => `exercises/${listSlug(listId)}/${fileId}.json`

const cacheKey = (id) => storageKey(`exfile.${id}`)

function cacheSet(id, text) {
  try { localStorage.setItem(cacheKey(id), text) } catch { /* quota: the repo copy is the source of truth */ }
}

// Always caches. Writes to the data repo unless local mode or no token. → { remote: boolean }
export async function saveExerciseFile(cfg, meta, json) {
  const text = JSON.stringify(json)
  cacheSet(meta.id, text)
  if (DATA_MODE === 'local' || !cfg?.token) return { remote: false }
  try {
    await putTextFile(cfg, dataPath(meta.path), text, undefined, `chore: exercises ${meta.id}`)
  } catch (e) {
    // 422 = same file id already in the repo (same content hash); nothing to add
    if (!/\(422\)/.test(String(e?.message))) throw e
  }
  return { remote: true }
}

// → parsed file or null (local mode without a cache entry, or unreadable).
export async function loadExerciseFile(cfg, meta) {
  try {
    const hit = localStorage.getItem(cacheKey(meta.id))
    if (hit) return JSON.parse(hit)
  } catch { /* fall through to the repo */ }
  if (DATA_MODE === 'local' || !cfg?.token) return null
  try {
    const text = await readFileContent(cfg, dataPath(meta.path))
    cacheSet(meta.id, text)
    return JSON.parse(text)
  } catch {
    return null
  }
}
