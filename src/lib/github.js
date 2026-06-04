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
