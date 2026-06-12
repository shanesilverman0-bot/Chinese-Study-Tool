// src/components/ToneCurve.jsx
// Overlays the learner's measured pitch contour against reference contours for
// ALL tones in the current word — one panel per syllable.
//
// Props:
//   userPoints  — array of {t, hz} from pitch.js (normalized 0–1 time)
//   tones       — number[] e.g. [2, 1] for "Táiwān"
//   score       — 0–1 match score from pitch.js (optional)
//
// The component renders one mini chart per syllable, side by side.
// Each chart shows the reference contour for that syllable's tone in gray,
// with the user's recording segment overlaid in color.

import React, { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

// ─── Reference contours (normalized pitch 0–1) ───────────────────────────────
// Each array has 20 sample points representing the idealized F0 shape.
const TONE_REFS = {
  1: [0.70,0.71,0.71,0.72,0.72,0.72,0.72,0.72,0.72,0.72,
      0.72,0.72,0.72,0.72,0.71,0.71,0.71,0.71,0.70,0.70],
  2: [0.35,0.37,0.39,0.42,0.46,0.50,0.54,0.58,0.62,0.65,
      0.68,0.70,0.72,0.74,0.75,0.76,0.77,0.78,0.78,0.78],
  3: [0.50,0.47,0.43,0.40,0.36,0.33,0.30,0.28,0.27,0.26,
      0.26,0.27,0.28,0.30,0.33,0.36,0.40,0.44,0.48,0.52],
  4: [0.80,0.77,0.74,0.70,0.66,0.62,0.57,0.52,0.47,0.43,
      0.38,0.34,0.30,0.27,0.24,0.22,0.20,0.19,0.18,0.18],
  5: [0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45,
      0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45,0.45],
}

const TONE_LABELS = { 1:'一聲', 2:'二聲', 3:'三聲', 4:'四聲', 5:'輕聲' }
const TONE_COLORS = { 1:'#3b82f6', 2:'#22c55e', 3:'#a855f7', 4:'#ef4444', 5:'#94a3b8' }

const N = 20

// Split user points evenly across syllables.
function splitUserPoints(userPoints, numSyllables) {
  if (!userPoints || userPoints.length === 0) {
    return Array.from({ length: numSyllables }, () => [])
  }
  const total = userPoints.length
  return Array.from({ length: numSyllables }, (_, i) => {
    const start = Math.floor((i / numSyllables) * total)
    const end   = Math.floor(((i + 1) / numSyllables) * total)
    return userPoints.slice(start, end)
  })
}

// Resample an array of values to exactly N points via linear interpolation.
function resampleToN(values, n) {
  if (!values || values.length === 0) return null
  if (values.length === 1) return Array(n).fill(values[0])
  const out = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const srcIdx = t * (values.length - 1)
    const lo = Math.floor(srcIdx)
    const hi = Math.min(lo + 1, values.length - 1)
    const frac = srcIdx - lo
    out.push(values[lo] * (1 - frac) + values[hi] * frac)
  }
  return out
}

// Normalize an array to [0,1] range. Returns null if flat/empty.
function normalize(vals) {
  if (!vals || vals.length === 0) return null
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  if (max - min < 1e-6) return null
  return vals.map((v) => (v - min) / (max - min))
}

function SyllableChart({ tone, userSegment, index, totalSyllables }) {
  const ref = TONE_REFS[tone] ?? TONE_REFS[5]
  const color = TONE_COLORS[tone] ?? '#94a3b8'
  const label = TONE_LABELS[tone] ?? '?'

  const data = useMemo(() => {
    // User segment: extract hz values, resample, normalize
    const rawHz = userSegment.map((p) => p.hz ?? p.y ?? p)
    const resampled = resampleToN(rawHz, N)
    const userNorm = resampled ? normalize(resampled) : null

    return Array.from({ length: N }, (_, i) => {
      const t = Math.round((i / (N - 1)) * 100)
      const pt = { t, reference: ref[i] }
      if (userNorm) pt.user = userNorm[i]
      return pt
    })
  }, [userSegment, ref])

  return (
    <div className="flex flex-col items-center flex-1 min-w-0">
      <div className="text-xs text-slate-400 mb-1">
        {totalSyllables > 1 ? `音節 ${index + 1} · ` : ''}{label}
      </div>
      <ResponsiveContainer width="100%" height={80}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <XAxis dataKey="t" hide />
          <YAxis domain={[0, 1]} hide />
          {/* Reference contour */}
          <Line
            type="monotone"
            dataKey="reference"
            stroke="#475569"
            strokeWidth={2}
            dot={false}
            strokeDasharray="4 2"
          />
          {/* User recording overlay */}
          <Line
            type="monotone"
            dataKey="user"
            stroke={color}
            strokeWidth={2.5}
            dot={false}
            activeDot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function ToneCurve({ userPoints, tones, score }) {
  if (!tones || tones.length === 0) return null

  const syllableSegments = useMemo(
    () => splitUserPoints(userPoints, tones.length),
    [userPoints, tones.length]
  )

  return (
    <div className="w-full">
      {/* Legend */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <span className="inline-block w-6 h-0.5 bg-slate-500" style={{ borderTop: '2px dashed #475569' }} />
            參考
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-6 h-0.5 bg-blue-400" />
            你的聲音
          </span>
        </div>
        {score != null && (
          <span
            className="text-xs font-medium"
            style={{ color: score > 0.7 ? '#22c55e' : score > 0.4 ? '#f59e0b' : '#ef4444' }}
          >
            {Math.round(score * 100)}%
          </span>
        )}
      </div>

      {/* One chart per syllable */}
      <div className="flex gap-2 w-full">
        {tones.map((tone, i) => (
          <SyllableChart
            key={i}
            tone={tone}
            userSegment={syllableSegments[i] ?? []}
            index={i}
            totalSyllables={tones.length}
          />
        ))}
      </div>

      {/* Tone key below */}
      <div className="flex gap-2 mt-1 justify-center flex-wrap">
        {tones.map((tone, i) => (
          <span
            key={i}
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              background: `${TONE_COLORS[tone]}22`,
              color: TONE_COLORS[tone],
              border: `1px solid ${TONE_COLORS[tone]}55`,
            }}
          >
            音節{i + 1}: {TONE_LABELS[tone]}
          </span>
        ))}
      </div>
    </div>
  )
}
