import React, { useEffect, useRef, useState } from 'react'
import { speak, ttsSupported } from '../lib/speech.js'
import { startRecording, scoreAgainstTone, primaryTone } from '../lib/pitch.js'
import { previewIntervals } from '../lib/fsrs.js'
import ToneCurve from './ToneCurve.jsx'
import AITutor from './AITutor.jsx'

const RATINGS = [
  { key: 'again', label: 'Again', color: '#a8201a' },
  { key: 'hard', label: 'Hard', color: '#b8860b' },
  { key: 'good', label: 'Good', color: '#2d6a4f' },
  { key: 'easy', label: 'Easy', color: '#1a6b8a' },
]

export default function Flashcard({ word, cardState, onRate, apiKey }) {
  const [revealed, setRevealed] = useState(false)
  const [recording, setRecording] = useState(false)
  const [contour, setContour] = useState(null)
  const [score, setScore] = useState(null)
  const [recError, setRecError] = useState('')
  const [showTutor, setShowTutor] = useState(false)
  const recCtrl = useRef(null)

  const intervals = previewIntervals(cardState)
  const tone = primaryTone(word.tones)

  // Reset per-card UI when the word changes.
  useEffect(() => {
    setRevealed(false)
    setContour(null)
    setScore(null)
    setRecError('')
    setShowTutor(false)
  }, [word.id])

  async function toggleRecord() {
    if (recording) {
      try {
        const result = recCtrl.current?.stop()
        setRecording(false)
        if (result && result.voiced) {
          setContour(result.points)
          setScore(scoreAgainstTone(result.points, tone))
        } else {
          setRecError("Didn't catch a clear voice — try again, a bit louder.")
        }
      } catch (e) {
        setRecError(e.message)
        setRecording(false)
      }
      return
    }
    setRecError('')
    setContour(null)
    setScore(null)
    try {
      recCtrl.current = await startRecording()
      setRecording(true)
    } catch (e) {
      setRecError('Microphone access denied or unavailable.')
    }
  }

  return (
    <div className="brush-in flex flex-col items-center">
      {/* Character face */}
      <div className="relative flex min-h-[180px] w-full flex-col items-center justify-center rounded-3xl border border-ink/10 bg-white/50 px-6 py-10 shadow-sm">
        <span className="absolute right-4 top-3 font-mono text-[10px] uppercase tracking-widest text-ink/30">
          {word.band}
        </span>
        <span className="font-display text-7xl font-bold leading-none text-ink sm:text-8xl">
          {word.hanzi}
        </span>

        {ttsSupported() && (
          <button
            onClick={() => speak(word.hanzi)}
            className="mt-5 flex items-center gap-2 rounded-full border border-ink/15 px-4 py-1.5 font-mono text-xs text-ink/60 transition hover:border-jade hover:text-jade"
          >
            ◀)) 播放發音
          </button>
        )}
      </div>

      {/* Reveal / answer */}
      {!revealed ? (
        <button
          onClick={() => setRevealed(true)}
          className="mt-5 w-full rounded-2xl bg-ink py-4 font-sans text-base font-medium text-paper transition hover:bg-ink/85"
        >
          顯示答案 · Show answer
        </button>
      ) : (
        <div className="mt-5 w-full brush-in">
          <div className="rounded-2xl bg-mist/60 px-5 py-4 text-center">
            <div className="font-mono text-lg text-cinnabar">{word.pinyin}</div>
            <div className="mt-1 font-sans text-lg text-ink/80">{word.english}</div>
          </div>
        </div>
      )}

      {/* Tone trainer */}
      <div className="mt-5 w-full rounded-2xl border border-ink/10 bg-white/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-display text-sm font-bold tracking-wide text-ink/70">
            聲調 · Tone Trainer
          </span>
          <button
            onClick={toggleRecord}
            className={`flex h-11 w-11 items-center justify-center rounded-full text-paper transition ${
              recording ? 'recording-pulse bg-cinnabar' : 'bg-ink hover:bg-ink/80'
            }`}
            aria-label={recording ? 'Stop recording' : 'Start recording'}
          >
            {recording ? '■' : '🎤'}
          </button>
        </div>

        {recError && (
          <p className="mb-2 rounded-lg bg-cinnabar/10 px-3 py-2 font-mono text-xs text-seal">
            {recError}
          </p>
        )}

        {recording && (
          <p className="mb-2 font-mono text-xs text-cinnabar">錄音中… 說出這個詞，再按停止</p>
        )}

        {(contour || true) && <ToneCurve userPoints={contour} toneNumber={tone} score={score} />}
      </div>

      {/* AI tutor trigger */}
      <button
        onClick={() => setShowTutor(true)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-cinnabar/30 py-3 font-sans text-sm text-cinnabar transition hover:bg-cinnabar/5"
      >
        ✦ 問老師 · Ask the AI tutor
      </button>

      {/* Rating row — only after reveal */}
      {revealed && (
        <div className="mt-5 grid w-full grid-cols-4 gap-2 brush-in">
          {RATINGS.map((r) => (
            <button
              key={r.key}
              onClick={() => onRate(r.key)}
              className="flex flex-col items-center rounded-xl border py-3 transition active:scale-95"
              style={{ borderColor: `${r.color}40` }}
            >
              <span className="font-sans text-sm font-medium" style={{ color: r.color }}>
                {r.label}
              </span>
              <span className="mt-0.5 font-mono text-[10px] text-ink/40">{intervals[r.key]}</span>
            </button>
          ))}
        </div>
      )}

      {showTutor && (
        <AITutor word={word} apiKey={apiKey} onClose={() => setShowTutor(false)} />
      )}
    </div>
  )
}
