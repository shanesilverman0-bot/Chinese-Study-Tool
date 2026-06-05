// Tone-curve analysis: record mic audio, extract an F0 (pitch) contour with
// the YIN algorithm (pitchfinder), and compare its SHAPE against the ideal
// Mandarin tone contour. Shape is compared (not absolute pitch) so high and
// low voices both score fairly.
//
// Recording uses MediaRecorder -> Blob -> decodeAudioData, which is far more
// robust and widely supported than the deprecated ScriptProcessorNode.

import { YIN } from 'pitchfinder'

const FRAME_SIZE = 1024 // samples per analysis window
const HOP = 0.02 // ~20 ms between frames

// Idealized reference contours over normalized time [0..1], normalized pitch [0..1].
export const TONE_REFERENCES = {
  1: { name: 'Tone 1 — flat high', points: sample(() => 0.85) },
  2: { name: 'Tone 2 — rising', points: sample((t) => 0.35 + 0.55 * t) },
  3: { name: 'Tone 3 — dip & rise', points: sample((t) => 0.5 - 0.45 * Math.sin(Math.PI * t) + 0.35 * t * t) },
  4: { name: 'Tone 4 — sharp fall', points: sample((t) => 0.9 - 0.75 * t) },
  5: { name: 'Tone 5 — neutral', points: sample((t) => 0.5 - 0.15 * t) },
}

function sample(fn, n = 40) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    pts.push({ t, pitch: clamp01(fn(t)) })
  }
  return pts
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x))
}

// Pick a MediaRecorder mime type the current browser supports.
function pickMime() {
  const candidates = ['audio/webm', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg']
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return ''
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c
  }
  return ''
}

// Begin recording from the mic. Returns a controller with stop() -> contour.
// Throws a descriptive error if anything is unavailable so the UI can surface it.
export async function startRecording() {
  if (!window.isSecureContext) {
    throw new Error('Microphone needs HTTPS. Open the app over https:// (GitHub Pages is fine).')
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not expose getUserMedia.')
  }
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('This browser does not support MediaRecorder.')
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  })

  const mime = pickMime()
  const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
  const chunks = []
  mr.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }
  mr.start()

  return {
    cancel() {
      try {
        mr.stop()
      } catch {}
      stream.getTracks().forEach((t) => t.stop())
    },
    stop() {
      return new Promise((resolve, reject) => {
        mr.onerror = (e) => reject(new Error('Recorder error: ' + (e.error?.message || 'unknown')))
        mr.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop())
          try {
            const blob = new Blob(chunks, { type: mr.mimeType || mime || 'audio/webm' })
            if (blob.size === 0) {
              resolve({ points: [], voiced: false, reason: 'No audio captured.' })
              return
            }
            const arrayBuf = await blob.arrayBuffer()
            const AudioCtx = window.AudioContext || window.webkitAudioContext
            const ctx = new AudioCtx()
            // Safari sometimes only supports the callback form of decodeAudioData.
            const audioBuf = await new Promise((res, rej) => {
              const p = ctx.decodeAudioData(arrayBuf, res, rej)
              if (p && typeof p.then === 'function') p.then(res).catch(rej)
            })
            const samples = audioBuf.getChannelData(0)
            const sr = audioBuf.sampleRate
            await ctx.close()
            resolve(analyzeContour(samples, sr))
          } catch (err) {
            reject(new Error('Could not decode the recording: ' + err.message))
          }
        }
        try {
          mr.stop()
        } catch (err) {
          reject(err)
        }
      })
    },
  }
}

// Run YIN frame-by-frame, drop unvoiced/outlier frames, normalize to [0..1].
function analyzeContour(samples, sampleRate) {
  const detectPitch = YIN({ sampleRate })
  const hopSamples = Math.max(1, Math.floor(HOP * sampleRate))
  const raw = []
  for (let i = 0; i + FRAME_SIZE <= samples.length; i += hopSamples) {
    const frame = samples.slice(i, i + FRAME_SIZE)
    const freq = detectPitch(frame)
    if (freq && freq > 70 && freq < 500) {
      raw.push(freq)
    }
  }
  if (raw.length < 4) {
    return { points: [], voiced: false, reason: 'No clear pitch detected — speak louder/closer.' }
  }

  const smoothed = medianSmooth(raw, 3)
  const minF = Math.min(...smoothed)
  const maxF = Math.max(...smoothed)
  const span = Math.max(1, maxF - minF)

  const points = smoothed.map((f, i) => ({
    t: i / (smoothed.length - 1),
    pitch: (f - minF) / span,
    freq: f,
  }))

  return { points, voiced: true, frames: raw.length }
}

function medianSmooth(arr, win) {
  const half = Math.floor(win / 2)
  return arr.map((_, i) => {
    const slice = arr.slice(Math.max(0, i - half), i + half + 1).sort((a, b) => a - b)
    return slice[Math.floor(slice.length / 2)]
  })
}

function resample(points, n = 40) {
  if (points.length === 0) return []
  const out = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    let lo = points[0]
    let hi = points[points.length - 1]
    for (let j = 0; j < points.length - 1; j++) {
      if (points[j].t <= t && points[j + 1].t >= t) {
        lo = points[j]
        hi = points[j + 1]
        break
      }
    }
    const range = hi.t - lo.t || 1
    const frac = (t - lo.t) / range
    out.push({ t, pitch: lo.pitch + (hi.pitch - lo.pitch) * frac })
  }
  return out
}

// Score how well the user's contour SHAPE matches the reference tone (0-100).
export function scoreAgainstTone(userPoints, toneNumber) {
  const ref = TONE_REFERENCES[toneNumber]
  if (!ref || !userPoints || userPoints.length < 4) return null
  const u = resample(userPoints, 40)
  const r = ref.points
  let sqErr = 0
  let dErr = 0
  for (let i = 0; i < u.length; i++) {
    sqErr += (u[i].pitch - r[i].pitch) ** 2
    if (i > 0) {
      const du = u[i].pitch - u[i - 1].pitch
      const dr = r[i].pitch - r[i - 1].pitch
      dErr += (du - dr) ** 2
    }
  }
  const valueRms = Math.sqrt(sqErr / u.length)
  const slopeRms = Math.sqrt(dErr / (u.length - 1))
  const combined = 0.45 * valueRms + 0.55 * slopeRms * 4
  return Math.max(0, Math.min(100, Math.round(clamp01(1 - combined) * 100)))
}

export function primaryTone(tones) {
  if (!tones || tones.length === 0) return 1
  const nonNeutral = tones.find((t) => t !== 5)
  return nonNeutral || tones[0]
}

// --- Diagnostics ---------------------------------------------------------
// Returns a report the Settings mic-test panel can display, plus (if a mic is
// granted) a short live RMS sample so the user can confirm audio is flowing.
export async function runAudioDiagnostics() {
  const report = {
    secureContext: !!window.isSecureContext,
    getUserMedia: !!navigator.mediaDevices?.getUserMedia,
    mediaRecorder: typeof MediaRecorder !== 'undefined',
    audioContext: !!(window.AudioContext || window.webkitAudioContext),
    chosenMime: pickMime() || '(default)',
    permission: 'unknown',
    micWorks: false,
    peakLevel: 0,
    error: '',
  }
  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({ name: 'microphone' })
      report.permission = status.state
    }
  } catch {
    /* permissions API not available for microphone in some browsers */
  }
  return report
}

// Open the mic and measure peak level for ~3s. Returns { peak, ok, error }.
export async function measureMicLevel(onLevel) {
  let stream
  let ctx
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    })
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    ctx = new AudioCtx()
    if (ctx.state === 'suspended') await ctx.resume()

    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048

    // CRITICAL: many browsers only process graph branches that reach the
    // destination. Route analyser -> muted gain -> destination so the input is
    // actually pulled (gain 0 keeps it silent — no feedback).
    const mute = ctx.createGain()
    mute.gain.value = 0
    source.connect(analyser)
    analyser.connect(mute)
    mute.connect(ctx.destination)

    const buf = new Float32Array(analyser.fftSize)
    let peak = 0
    const start = performance.now()

    return await new Promise((resolve) => {
      const tick = () => {
        analyser.getFloatTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
        const rms = Math.sqrt(sum / buf.length)
        peak = Math.max(peak, rms)
        if (onLevel) onLevel(rms)
        if (performance.now() - start < 3000) {
          requestAnimationFrame(tick)
        } else {
          stream.getTracks().forEach((t) => t.stop())
          ctx.close()
          // 0.002 RMS is a low bar — normal speech peaks far above this.
          resolve({ peak, ok: peak > 0.002, error: '' })
        }
      }
      requestAnimationFrame(tick)
    })
  } catch (e) {
    try {
      stream?.getTracks().forEach((t) => t.stop())
      ctx?.close()
    } catch {}
    return { peak: 0, ok: false, error: e.message }
  }
}
