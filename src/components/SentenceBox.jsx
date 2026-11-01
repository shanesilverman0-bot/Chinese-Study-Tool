import React, { useState } from 'react'
import { latestGraded } from '../lib/sentences.js'

// Under the rating row (DESIGN §12): collapsed "造句" box → textarea + Save, and the latest graded sentence.
// Keyed by the word in Flashcard's parent render, so state resets per card.
export default function SentenceBox({ wordKey, sentences, onAdd }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [toast, setToast] = useState('')
  const last = latestGraded(sentences, wordKey)
  const g = last?.grade

  const save = () => {
    if (!text.trim() || !onAdd) return
    const n = onAdd(wordKey, text)
    setText('')
    setOpen(false)
    setToast(`Queued (${n})`)
    setTimeout(() => setToast(''), 2500)
  }

  return (
    <div key={wordKey} className="mt-4 w-full">
      {open ? (
        <div className="rounded-2xl border border-ink/10 bg-white/40 p-3">
          <textarea
            autoFocus
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="用這個詞造一個句子…"
            className="w-full rounded-xl border border-ink/15 bg-white/60 px-3 py-2 font-sans text-base text-ink outline-none focus:border-cinnabar"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={save}
              disabled={!text.trim()}
              className="rounded-full bg-cinnabar px-4 py-1.5 font-display text-sm font-bold text-paper disabled:opacity-40"
            >
              Save
            </button>
            <button
              onClick={() => { setOpen(false); setText('') }}
              className="rounded-full border border-ink/20 px-4 py-1.5 font-sans text-sm text-ink/60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-full rounded-2xl border border-dashed border-ink/20 py-3 font-sans text-sm text-ink/55 transition hover:border-ink/40 hover:text-ink/70"
        >
          ✎ 造句 · Write a sentence
        </button>
      )}

      {toast && <p className="mt-2 text-center font-mono text-xs text-jade">{toast}</p>}

      {g && (
        <div className="mt-3 rounded-2xl bg-mist/60 px-4 py-3 text-left">
          <div className="font-mono text-xs text-ink/60">
            <span className={g.correct ? 'text-jade' : 'text-seal'}>{g.correct ? '✓' : '✗'} correct</span>
            {' · '}
            <span className={g.natural ? 'text-jade' : 'text-seal'}>{g.natural ? '✓' : '✗'} natural</span>
          </div>
          <div className="mt-1 font-sans text-sm text-ink/50 line-through decoration-ink/20">{last.sentence}</div>
          <div className="mt-1 font-sans text-base text-ink">{g.corrected}</div>
          {g.note && <div className="mt-1 font-sans text-xs text-ink/60">{g.note}</div>}
        </div>
      )}
    </div>
  )
}
