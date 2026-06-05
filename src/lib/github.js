// Cross-device sync via the GitHub Contents API. Progress lives as a single
// progress.json file committed into the user's own repo. No backend, no DB.
//
// Settings (PAT, owner, repo, branch, path) are stored in localStorage and
// passed in here. The PAT needs `repo` scope (or `contents:write` for a
// fine-grained token scoped to the one repository).

const API = 'https://api.github.com'

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function b64encode(str) {
  return btoa(unescape(encodeURIComponent(str)))
}
function b64decode(str) {
  return decodeURIComponent(escape(atob(str)))
}

// Returns { data, sha } or { data: null, sha: null } if the file doesn't exist.
export async function fetchProgress({ token, owner, repo, branch = 'main', path = 'progress.json' }) {
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`
  const res = await fetch(url, { headers: headers(token) })
  if (res.status === 404) return { data: null, sha: null }
  if (!res.ok) throw new Error(`GitHub fetch failed (${res.status}): ${await res.text()}`)
  const json = await res.json()
  const content = b64decode(json.content.replace(/\n/g, ''))
  return { data: JSON.parse(content), sha: json.sha }
}

// Commit progress back. Pass the sha from the last fetch to update in place;
// omit it to create the file.
export async function saveProgress(
  { token, owner, repo, branch = 'main', path = 'progress.json' },
  data,
  sha
) {
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`
  const body = {
    message: `chore: update study progress ${new Date().toISOString()}`,
    content: b64encode(JSON.stringify(data, null, 2)),
    branch,
  }
  if (sha) body.sha = sha
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`GitHub save failed (${res.status}): ${await res.text()}`)
  const json = await res.json()
  return { sha: json.content.sha }
}

// Quick credential check for the settings screen.
export async function verifyAccess({ token, owner, repo }) {
  const res = await fetch(`${API}/repos/${owner}/${repo}`, { headers: headers(token) })
  if (!res.ok) throw new Error(`Cannot access ${owner}/${repo} (${res.status})`)
  const json = await res.json()
  return { ok: true, permissions: json.permissions, defaultBranch: json.default_branch }
}

// --- File manager operations --------------------------------------------

// List the contents of a directory. Returns [] for an empty/nonexistent dir.
// Each item: { name, path, type: 'file'|'dir', sha, size }.
export async function listDir({ token, owner, repo, branch = 'main' }, path = '') {
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${branch}`
  const res = await fetch(url, { headers: headers(token) })
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`List failed (${res.status}): ${await res.text()}`)
  const json = await res.json()
  const items = Array.isArray(json) ? json : [json]
  return items
    .map((i) => ({ name: i.name, path: i.path, type: i.type, sha: i.sha, size: i.size }))
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
}

// Create or overwrite a text file. Pass existing sha to overwrite.
export async function putTextFile(
  { token, owner, repo, branch = 'main' },
  path,
  text,
  sha,
  message
) {
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`
  const body = {
    message: message || `chore: write ${path}`,
    content: b64encode(text),
    branch,
  }
  if (sha) body.sha = sha
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Write failed (${res.status}): ${await res.text()}`)
  return res.json()
}

// Upload a File/Blob (any type) using its base64 contents.
export async function uploadFile(cfg, dirPath, file) {
  const base64 = await fileToBase64(file)
  const path = dirPath ? `${dirPath.replace(/\/$/, '')}/${file.name}` : file.name
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`
  // If the file already exists we need its sha to overwrite.
  let sha
  try {
    const existing = await fetch(`${url}?ref=${cfg.branch || 'main'}`, { headers: headers(cfg.token) })
    if (existing.ok) sha = (await existing.json()).sha
  } catch {}
  const body = {
    message: `chore: upload ${file.name}`,
    content: base64,
    branch: cfg.branch || 'main',
  }
  if (sha) body.sha = sha
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...headers(cfg.token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Upload failed (${res.status}): ${await res.text()}`)
  return res.json()
}

// Git has no empty folders, so a "folder" is created by adding a .gitkeep file.
export async function createFolder(cfg, dirPath) {
  const path = `${dirPath.replace(/\/$/, '')}/.gitkeep`
  return putTextFile(cfg, path, '', undefined, `chore: create folder ${dirPath}`)
}

// Delete a file (needs its sha). The caller confirms with the user first.
export async function deleteFile({ token, owner, repo, branch = 'main' }, path, sha) {
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `chore: delete ${path}`, sha, branch }),
  })
  if (!res.ok) throw new Error(`Delete failed (${res.status}): ${await res.text()}`)
  return res.json()
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.toString().split(',')[1])
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

// Read a text file's decoded contents (used by the vocab pack loader).
export async function readFileContent({ token, owner, repo, branch = 'main' }, path) {
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${branch}`
  const res = await fetch(url, { headers: headers(token) })
  if (!res.ok) throw new Error(`Read failed (${res.status}): ${await res.text()}`)
  const json = await res.json()
  return b64decode(json.content.replace(/\n/g, ''))
}
