import React from 'react'

// DESIGN §11.5: depth meter, one segment per point (max default 10), with "n/10".
export default function UnderstandingBar({ value, max = 10 }) {
  const full = Math.min(max, Math.floor(value))
  return (
    <span className="inline-flex items-center gap-1.5" title="Understanding score">
      <span className="flex gap-px">
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={`h-2 w-1.5 rounded-sm ${i < full ? 'bg-jade' : 'bg-ink/15'}`} />
        ))}
      </span>
      <span className="font-mono text-[10px] text-ink/50">{full}/{max}</span>
    </span>
  )
}
