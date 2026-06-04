import React, { useState } from 'react'
import { askTutor, TUTOR_MODES } from '../lib/claude.js'

// Slide-up panel that queries Claude for help on the current word.
export default function AITutor({ word, apiKey, onClose }) {
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')
  const [activeMode, setActiveMode] = useState(null)
  const [custom, setCustom] = useState('')

  async function run(modeKey, extra = '') {
    if (!apiKey) {
      setError('Add your Claude API key in Settings first.')
      return
    }
    setLoading(true)
    setError('')
    setAnswer('')
    setActiveMode(modeKey)
    try {
      const text = await askTutor({ apiKey }, word, modeKey, extra)
      setAnswer(text)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center">
      <div className="brush-in flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-3xl bg-paper paper-texture shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-2xl font-bold text-ink">{word.hanzi}</span>
            <span className="font-mono text-sm text-cinnabar">{word.pinyin}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-full px-3 py-1 font-mono text-xs text-ink/50 hover:bg-ink/5"
          >
            ✕ close
          </button>
        </div>

        <div className="flex flex-wrap gap-2 px-5 pt-4">
          {TUTOR_MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => run(m.key)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                activeMode === m.key
                  ? 'border-cinnabar bg-cinnabar text-paper'
                  : 'border-ink/15 text-ink/70 hover:border-cinnabar hover:text-cinnabar'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center gap-2 font-mono text-sm text-ink/50">
              <span className="h-2 w-2 animate-pulse rounded-full bg-cinnabar" />
              老師思考中…
            </div>
          )}
          {error && (
            <p className="rounded-lg bg-cinnabar/10 px-3 py-2 font-mono text-xs text-seal">
              {error}
            </p>
          )}
          {answer && (
            <div className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-ink/90">
              {answer}
            </div>
          )}
          {!loading && !answer && !error && (
            <p className="font-sans text-sm text-ink/40">
              Tap a topic above, or ask your own question below.
            </p>
          )}
        </div>

        <div className="border-t border-ink/10 px-5 py-3">
          <div className="flex gap-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && custom.trim() && run('examples', custom)}
              placeholder="Ask anything about this word…"
              className="flex-1 rounded-full border border-ink/15 bg-white/60 px-4 py-2 text-sm text-ink outline-none focus:border-cinnabar"
            />
            <button
              onClick={() => custom.trim() && run('examples', custom)}
              className="rounded-full bg-ink px-4 py-2 text-sm text-paper hover:bg-ink/80"
            >
              Ask
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
