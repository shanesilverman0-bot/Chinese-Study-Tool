import React from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceArea,
} from 'recharts'
import { TONE_REFERENCES } from '../lib/pitch.js'

// Overlays the learner's measured pitch contour against the ideal reference
// for the target tone. Both are normalized to [0..1] so shape is comparable.
export default function ToneCurve({ userPoints, toneNumber, score }) {
  const ref = TONE_REFERENCES[toneNumber]
  if (!ref) return null

  // Merge into a single dataset keyed by normalized time for Recharts.
  const N = 40
  const data = []
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1)
    const refPt = ref.points[i]
    data.push({
      t: Math.round(t * 100),
      reference: refPt ? refPt.pitch : null,
      you: sampleAt(userPoints, t),
    })
  }

  return (
    <div className="w-full">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-mono text-xs uppercase tracking-widest text-ink/50">
          {ref.name}
        </span>
        {score != null && (
          <span
            className="font-mono text-sm font-medium"
            style={{ color: score >= 75 ? '#2d6a4f' : score >= 50 ? '#b8860b' : '#c0392b' }}
          >
            {score}%
          </span>
        )}
      </div>
      <div className="h-44 w-full rounded-xl border border-ink/10 bg-white/40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 14, right: 14, bottom: 6, left: 0 }}>
            <ReferenceArea y1={0} y2={1} fill="#1a1614" fillOpacity={0.02} />
            <XAxis dataKey="t" hide domain={[0, 100]} />
            <YAxis hide domain={[0, 1]} />
            <Line
              type="monotone"
              dataKey="reference"
              stroke="#c0392b"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="you"
              stroke="#2d6a4f"
              strokeWidth={3}
              dot={false}
              isAnimationActive={true}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center gap-4 font-mono text-[11px] text-ink/50">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-cinnabar" style={{ borderTop: '2px dashed #c0392b' }} />
          ideal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-jade" />
          you
        </span>
      </div>
    </div>
  )
}

function sampleAt(points, t) {
  if (!points || points.length === 0) return null
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
  return lo.pitch + (hi.pitch - lo.pitch) * frac
}
