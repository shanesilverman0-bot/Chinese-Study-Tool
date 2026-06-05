import React, { useCallback, useEffect, useRef, useState } from 'react'
import { listDir, uploadFile, createFolder, deleteFile } from '../lib/github.js'

// In-browser file manager for the synced repo. Navigate folders, upload files
// (e.g. vocab packs), create folders, and delete. Every write is an explicit
// user action; deletes ask for confirmation first.
export default function RepoFiles({ github, onChanged }) {
  const [path, setPath] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const fileInput = useRef(null)

  const ready = github?.token && github?.owner && github?.repo

  const load = useCallback(
    async (p) => {
      if (!ready) return
      setLoading(true)
      setError('')
      try {
        setItems(await listDir(github, p))
      } catch (e) {
        setError(e.message)
        setItems([])
      } finally {
        setLoading(false)
      }
    },
    [github, ready]
  )

  useEffect(() => {
    load(path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, github.owner, github.repo, github.token, github.branch])

  function enterDir(name) {
    setPath((prev) => (prev ? `${prev}/${name}` : name))
  }

  function up() {
    setPath((prev) => prev.split('/').slice(0, -1).join('/'))
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setBusy(`Uploading ${files.length} file(s)…`)
    setError('')
    try {
      for (const f of files) await uploadFile(github, path, f)
      await load(path)
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function handleNewFolder() {
    const name = window.prompt('New folder name:')
    if (!name) return
    const clean = name.trim().replace(/^\/+|\/+$/g, '')
    if (!clean) return
    setBusy('Creating folder…')
    setError('')
    try {
      await createFolder(github, path ? `${path}/${clean}` : clean)
      await load(path)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function handleDelete(item) {
    if (item.type !== 'file') {
      window.alert('Delete the files inside a folder first (git folders vanish when empty).')
      return
    }
    if (!window.confirm(`Delete ${item.path}? This commits a deletion to your repo and cannot be undone from here.`)) {
      return
    }
    setBusy(`Deleting ${item.name}…`)
    setError('')
    try {
      await deleteFile(github, item.path, item.sha)
      await load(path)
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  if (!ready) {
    return (
      <div className="rounded-2xl border border-ink/10 bg-white/50 p-5 font-sans text-sm text-ink/60">
        Configure GitHub sync in Settings first — the file manager needs your repo and token.
      </div>
    )
  }

  return (
    <div className="brush-in flex flex-col gap-4 pb-10">
      {/* Breadcrumb + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-xs text-ink/60">
          <button onClick={() => setPath('')} className="hover:text-cinnabar">
            {github.repo}
          </button>
          {path.split('/').filter(Boolean).map((seg, i, arr) => (
            <span key={i}>
              {' / '}
              <button
                onClick={() => setPath(arr.slice(0, i + 1).join('/'))}
                className="hover:text-cinnabar"
              >
                {seg}
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {path && (
          <button
            onClick={up}
            className="rounded-full border border-ink/20 px-3 py-1.5 font-sans text-sm text-ink/70 hover:border-ink/40"
          >
            ↑ Up
          </button>
        )}
        <button
          onClick={() => fileInput.current?.click()}
          className="rounded-full bg-cinnabar px-4 py-1.5 font-sans text-sm text-paper hover:bg-seal"
        >
          ⬆ Upload files
        </button>
        <button
          onClick={handleNewFolder}
          className="rounded-full border border-ink/20 px-4 py-1.5 font-sans text-sm text-ink/70 hover:border-jade hover:text-jade"
        >
          + New folder
        </button>
        <button
          onClick={() => load(path)}
          className="rounded-full border border-ink/20 px-3 py-1.5 font-sans text-sm text-ink/70 hover:border-ink/40"
        >
          ↻
        </button>
        <input ref={fileInput} type="file" multiple onChange={handleUpload} className="hidden" />
      </div>

      {busy && <p className="font-mono text-xs text-gold">{busy}</p>}
      {error && (
        <p className="rounded-lg bg-cinnabar/10 px-3 py-2 font-mono text-xs text-seal">{error}</p>
      )}

      {/* Listing */}
      <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white/50">
        {loading ? (
          <p className="px-4 py-6 text-center font-mono text-xs text-ink/40">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-6 text-center font-mono text-xs text-ink/40">
            Empty folder. Upload a file or create a subfolder.
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.path}
              className="flex items-center justify-between border-b border-ink/5 px-4 py-3 last:border-0"
            >
              <button
                onClick={() => item.type === 'dir' && enterDir(item.name)}
                className={`flex items-center gap-3 text-left ${
                  item.type === 'dir' ? 'cursor-pointer' : 'cursor-default'
                }`}
              >
                <span className="text-base">{item.type === 'dir' ? '📁' : '📄'}</span>
                <span className="font-sans text-sm text-ink/80">{item.name}</span>
                {item.type === 'file' && (
                  <span className="font-mono text-[10px] text-ink/35">
                    {formatSize(item.size)}
                  </span>
                )}
              </button>
              <button
                onClick={() => handleDelete(item)}
                className="rounded-full px-2 py-1 font-mono text-[11px] text-ink/30 hover:bg-cinnabar/10 hover:text-seal"
              >
                delete
              </button>
            </div>
          ))
        )}
      </div>

      <p className="font-sans text-xs text-ink/45">
        Tip: drop <span className="font-mono">.json</span> vocab packs into a{' '}
        <span className="font-mono">vocab/</span> folder — the app auto-loads them on next sync.
      </p>
    </div>
  )
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
