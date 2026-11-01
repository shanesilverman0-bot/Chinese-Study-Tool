import React, { useState } from 'react'
import { runAudioDiagnostics, measureMicLevel, startRecording } from '../lib/pitch.js'

function Row({ label, ok, value }) {
  return (
    <div className="flex items-center justify-between py-1.5 font-mono text-xs">
      <span className="text-ink/60">{label}</span>
      <span className={ok ? 'text-jade' : 'text-seal'}>
        {ok ? '✓ ' : '✗ '}
        {value}
      </span>
    </div>
  )
}

export default function MicTest() {
  const [report, setReport] = useState(null)
  const [level, setLevel] = useState(0)
  const [testing, setTesting] = useState(false)
  const [micResult, setMicResult] = useState(null)

  const [rec, setRec] = useState(null)
  const [recording, setRecording] = useState(false)

  // startRecording() must be called synchronously in the tap handler.
  function recordTwo() {
    setRecording(true)
    setRec(null)
    let ctrl
    startRecording()
      .then((c) => {
        ctrl = c
        return new Promise((r) => setTimeout(r, 2000))
      })
      .then(() => ctrl.stop())
      .then((r) => setRec(r))
      .catch((e) => setRec({ error: e.message }))
      .finally(() => setRecording(false))
  }

  async function check() {
    setReport(await runAudioDiagnostics())
  }

  async function testMic() {
    setTesting(true)
    setMicResult(null)
    setLevel(0)
    const res = await measureMicLevel((rms) => setLevel(rms))
    setMicResult(res)
    setTesting(false)
  }

  return (
    <section className="rounded-2xl border border-ink/10 bg-white/50 p-5">
      <h3 className="mb-1 font-display text-base font-bold text-ink">麥克風檢測 · Mic test</h3>
      <p className="mb-3 font-sans text-xs text-ink/50">
        Run this if the Tone Trainer isn't reacting to your voice.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={check}
          className="rounded-full border border-ink/20 px-4 py-1.5 font-sans text-sm text-ink/70 hover:border-jade hover:text-jade"
        >
          Run diagnostics
        </button>
        <button
          onClick={testMic}
          disabled={testing}
          className="rounded-full border border-ink/20 px-4 py-1.5 font-sans text-sm text-ink/70 hover:border-cinnabar hover:text-cinnabar disabled:opacity-50"
        >
          {testing ? 'Listening… speak now' : 'Test mic level'}
        </button>
        <button
          onClick={recordTwo}
          disabled={recording || testing}
          className="rounded-full border border-ink/20 px-4 py-1.5 font-sans text-sm text-ink/70 hover:border-cinnabar hover:text-cinnabar disabled:opacity-50"
        >
          {recording ? 'Recording… speak now' : 'Record 2 s'}
        </button>
      </div>

      {/* Live level meter */}
      {(testing || micResult) && (
        <div className="mt-4">
          <div className="h-3 w-full overflow-hidden rounded-full bg-ink/10">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, level * 600)}%`,
                backgroundColor: level > 0.02 ? '#2d6a4f' : '#b8860b',
              }}
            />
          </div>
          {micResult && (
            <p
              className="mt-2 font-mono text-xs"
              style={{ color: micResult.ok ? '#2d6a4f' : '#c0392b' }}
            >
              {micResult.error
                ? `Error: ${micResult.error}`
                : micResult.ok
                  ? `Mic is working (peak ${(micResult.peak * 100).toFixed(0)}%).`
                  : 'No signal detected — check the mic and OS/browser permissions.'}
            </p>
          )}
        </div>
      )}

      {rec && (
        <div className="mt-4 rounded-xl bg-ink/[0.03] p-3 font-mono text-xs text-ink/70">
          {rec.error ? (
            <p className="text-seal">Error: {rec.error}</p>
          ) : (
            <>
              <p>sampleRate: {rec.sampleRate}</p>
              <p>samples: {rec.sampleCount}</p>
              <p>peak: {rec.peak.toFixed(3)}</p>
              <p>voiced frames: {rec.voiced ? rec.frames : 0}</p>
              {!rec.voiced && <p className="text-seal">{rec.reason}</p>}
            </>
          )}
        </div>
      )}

      {report && (
        <div className="mt-4 rounded-xl bg-ink/[0.03] p-3">
          <Row label="HTTPS / secure context" ok={report.secureContext} value={report.secureContext ? 'yes' : 'NO — needs https'} />
          <Row label="getUserMedia" ok={report.getUserMedia} value={report.getUserMedia ? 'available' : 'missing'} />
          <Row label="AudioContext" ok={report.audioContext} value={report.audioContext ? 'available' : 'missing'} />
          <Row label="Mic permission" ok={report.permission !== 'denied'} value={report.permission} />
        </div>
      )}
    </section>
  )
}
