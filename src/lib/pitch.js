// Tone-curve analysis: record mic audio, extract an F0 (pitch) contour with
// the YIN algorithm (pitchfinder), and compare its SHAPE against the ideal
// Mandarin tone contour. We compare shape (normalized rise/fall), not absolute
// pitch, so a low or high voice both score fairly.

import { YIN } from 'pitchfinder'

const FRAME_SIZE = 1024 // samples per analysis window
const HOP = 0.02 // ~20 ms between frames

// Idealized reference contours over normalized time [0..1], normalized pitch [0..1].
// Tone 1: flat high. Tone 2: rising. Tone 3: dip then rise. Tone 4: sharp fall.
// Tone 5 (neutral): light, short, mid — treated as a gentle fall.
export const TONE_REFERENCES = {
  1: { name: 'Tone 1 — flat high', points: sample((t) => 0.85) },
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

// Record from the microphone until stop() is called. Returns a controller.
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  const ctx = new AudioCtx()
  const source = ctx.createMediaStreamSource(stream)
  const chunks = []
  // ScriptProcessor is deprecated but universally supported and simplest for
  // offline-style capture; we just accumulate raw samples here.
  const processor = ctx.createScriptProcessor(FRAME_SIZE, 1, 1)
  source.connect(processor)
  processor.connect(ctx.destination)
  processor.onaudioprocess = (e) => {
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
  }

  return {
    stop() {
      processor.disconnect()
      source.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      const sampleRate = ctx.sampleRate
      ctx.close()
      const merged = mergeChunks(chunks)
      return analyzeContour(merged, sampleRate)
    },
  }
}

function mergeChunks(chunks) {
  const len = chunks.reduce((a, c) => a + c.length, 0)
  const out = new Float32Array(len)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

// Run YIN frame-by-frame, drop unvoiced/outlier frames, normalize to [0..1].
function analyzeContour(samples, sampleRate) {
  const detectPitch = YIN({ sampleRate })
  const hopSamples = Math.floor(HOP * sampleRate)
  const raw = []
  for (let i = 0; i + FRAME_SIZE <= samples.length; i += hopSamples) {
    const frame = samples.slice(i, i + FRAME_SIZE)
    const freq = detectPitch(frame)
    // Keep only plausible human-voice fundamentals.
    if (freq && freq > 70 && freq < 500) {
      raw.push({ idx: i / sampleRate, freq })
    }
  }
  if (raw.length < 4) return { points: [], score: null, voiced: false }

  // Trim leading/trailing silence already excluded; smooth with median.
  const smoothed = medianSmooth(raw.map((r) => r.freq), 3)
  const minF = Math.min(...smoothed)
  const maxF = Math.max(...smoothed)
  const span = Math.max(1, maxF - minF)

  const points = smoothed.map((f, i) => ({
    t: i / (smoothed.length - 1),
    pitch: (f - minF) / span,
    freq: f,
  }))

  return { points, voiced: true }
}

function medianSmooth(arr, win) {
  const half = Math.floor(win / 2)
  return arr.map((_, i) => {
    const slice = arr.slice(Math.max(0, i - half), i + half + 1).sort((a, b) => a - b)
    return slice[Math.floor(slice.length / 2)]
  })
}

// Resample a contour to N evenly spaced points over [0..1].
function resample(points, n = 40) {
  if (points.length === 0) return []
  const out = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    // find surrounding samples
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

// Score how well the user's contour SHAPE matches the reference tone.
// We compare the normalized derivative (direction of pitch movement) plus the
// raw normalized values, then map RMS error to a 0-100 similarity score.
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
  // Weight shape (slope) more heavily than absolute level.
  const combined = 0.45 * valueRms + 0.55 * slopeRms * 4
  const score = Math.round(clamp01(1 - combined) * 100)
  return Math.max(0, Math.min(100, score))
}

// For the first syllable's tone (most words here are 1-2 syllables; we show
// the contour for the whole utterance against the first non-neutral tone).
export function primaryTone(tones) {
  if (!tones || tones.length === 0) return 1
  const nonNeutral = tones.find((t) => t !== 5)
  return nonNeutral || tones[0]
}
