import React, { useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { hoursByWeek } from '../lib/sessions.js'

export default function HoursChart({ sessions, manualEntries, tz, onAddManual }) {
  const rows = useMemo(() => hoursByWeek(sessions, manualEntries, tz), [sessions, manualEntries, tz])
  const data = rows.map((r) => ({
    label: r.weekStart.slice(5).replace('-', '/'),
    timer: +r.timerH.toFixed(2),
    manual: +r.manualH.toFixed(2),
  }))
  const cur = rows[rows.length - 1]
  const thisWeek = cur.timerH + cur.manualH
  return (
    <div className="rounded-2xl border border-ink/10 bg-white/50 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-bold tracking-wide text-ink/70">每週時數 · Hours per week</h3>
        <button onClick={onAddManual} className="rounded-full border border-ink/20 px-3 py-1 font-sans text-xs text-ink/70">
          + 手動紀錄
        </button>
      </div>
      <div style={{ width: '100%', height: 160 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a161420" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} unit="h" />
            <Tooltip formatter={(v, n) => [`${v} h`, n === 'timer' ? 'Timer' : 'Manual']} />
            <Bar dataKey="timer" stackId="h" fill="#1a6b8a" />
            <Bar dataKey="manual" stackId="h" fill="#b8860b" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 font-mono text-[11px] text-ink/50">
        This week: <span className="font-semibold text-ink/80">{thisWeek.toFixed(1)} h</span>
        <span className="ml-3"><span style={{ color: '#1a6b8a' }}>■</span> timer <span style={{ color: '#b8860b' }}>■</span> manual</span>
      </p>
    </div>
  )
}
