// Data modes (DESIGN §3): live / dev / local, the path mapping, and the write
// guard. Every GitHub write goes through assertWriteAllowed(). No options, no
// bypass.

export function computeMode(envMode, hostname) {
  if (envMode === 'live' && typeof hostname === 'string' && hostname.endsWith('.github.io')) return 'live'
  if (envMode === 'local') return 'local'
  return 'dev'
}

export const DATA_MODE = computeMode(import.meta.env.VITE_DATA_MODE, location.hostname)

export const APP_REPO = 'shanesilverman0-bot/Chinese-Study-Tool'
export const DEFAULT_DATA_REPO = { owner: 'shanesilverman0-bot', repo: 'Chinese-Study-Data', branch: 'main' }

export function dataPath(rel) {
  return DATA_MODE === 'dev' ? `dev/${rel}` : rel
}

export function storageKey(name) {
  return DATA_MODE === 'live' ? `tocfl.${name}` : `tocfl.${DATA_MODE}.${name}`
}

function dataRepoOf(settings) {
  return {
    owner: settings?.data?.owner || DEFAULT_DATA_REPO.owner,
    repo: settings?.data?.repo || DEFAULT_DATA_REPO.repo,
  }
}

export function effectiveGithub(settings) {
  const { owner, repo } = dataRepoOf(settings)
  return {
    token: DATA_MODE === 'local' ? '' : settings?.github?.token || '',
    owner,
    repo,
    branch: 'main',
    path: dataPath('progress.json'),
  }
}

function storedSettings() {
  try {
    return JSON.parse(localStorage.getItem(storageKey('settings')) || '{}')
  } catch {
    return {}
  }
}

// Throws Error('Blocked write: …'); never returns false.
export function assertWriteAllowed({ owner, repo, path }) {
  const target = `${owner}/${repo}`
  const blocked = () => new Error(`Blocked write: ${DATA_MODE} mode cannot write ${target}:${path}`)
  const p = String(path ?? '')
  const data = dataRepoOf(storedSettings())
  if (DATA_MODE === 'local') throw blocked()
  if (target === APP_REPO) throw blocked()
  if (target !== `${data.owner}/${data.repo}`) throw blocked()
  if (DATA_MODE === 'dev' && !p.startsWith('dev/')) throw blocked()
  if (DATA_MODE === 'live' && p.startsWith('dev/')) throw blocked()
}
