import React, { useEffect, useState } from 'react'
import { loadActive, startSession, endSession, discardSession, STALE_SESSION_MS } from '../lib/sessions.js'

const fmt = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
const fmtTime = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function SessionTimer({ addSession, snapshotNow }) {
  const [active, setActive] = useState(loadActive)
  const [, tick] = useState(0)
  // Stale (> 12 h) session found on app start → ask what to do.
  const [stale, setStale] = useState(() => {
    const a = loadActive()
    return a && Date.now() - Date.parse(a.start) > STALE_SESSION_MS ? a : null
  })

  useEffect(() => {
    if (!active || stale) return undefined
    const id = setInterval(() => tick((n) => n + 1), 1000)
    const onVis = () => tick((n) => n + 1) // recompute from `start` on return
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [active, stale])

  const finish = (at) => {
    const s = endSession(at)
    setActive(null)
    setStale(null)
    if (s) {
      addSession(s)
      snapshotNow?.()
    }
  }

  return (
    <>
      {active && !stale ? (
        <button
          onClick={() => finish(new Date())}
          className="mr-1 rounded-full bg-cinnabar px-2.5 py-1 font-mono text-[11px] text-paper"
          aria-label="End session"
        >
          {fmt(Date.now() - Date.parse(active.start))} ■
        </button>
      ) : (
        !stale && (
          <button
            onClick={() => setActive(startSession())}
            className="mr-1 rounded-full border border-paper/40 px-2.5 py-1 font-sans text-[11px] text-paper/80"
          >
            ▶ 開始
          </button>
        )
      )}

      {stale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-paper p-5 text-ink shadow-xl">
            <p className="font-sans text-sm">You left a session running since {fmtTime(stale.start)}.</p>
            <div className="mt-4 flex flex-col gap-2">
              <button onClick={() => finish(stale.lastActivity)} className="rounded-xl bg-cinnabar py-2.5 font-sans text-sm text-paper">
                End it at {fmtTime(stale.lastActivity)}
              </button>
              <button onClick={() => finish(new Date())} className="rounded-xl border border-ink/20 py-2.5 font-sans text-sm">
                End now
              </button>
              <button onClick={() => { discardSession(); setActive(null); setStale(null) }} className="rounded-xl py-2.5 font-sans text-sm text-ink/60">
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
