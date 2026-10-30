import React, { useMemo, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { storageKey } from '../lib/dataMode.js'
import { goalEndDate } from '../data/exams.js'
import { dateT, goalStartValue, liveGoals } from '../lib/pace.js'

const SERIES = [
  { key: 'seen', label: 'Seen', color: '#8a8178', width: 2 },
  { key: 'known', label: 'Known', color: '#c0392b', width: 3 },
  { key: 'context', label: 'Context', color: '#2d6a4f', width: 2 },
]
const GOAL_COLORS = ['#b8860b', '#1a6b8a', '#7b4b94', '#c26a1b']
const DAY = 86400000
const SERIES_KEY = storageKey('chartSeries')

function loadHidden() {
  try {
    const v = JSON.parse(localStorage.getItem(SERIES_KEY) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

const fmtTick = (t) => {
  const d = new Date(t)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

function Chip({ on, color, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 font-mono text-[11px] transition ${on ? 'text-paper' : 'bg-transparent text-ink/50'}`}
      style={{ borderColor: color, backgroundColor: on ? color : undefined }}
    >
      {children}
    </button>
  )
}

export default function ProgressChart({ snapshots, today, counts, goals, onToggleGoal }) {
  const [hidden, setHidden] = useState(loadHidden)
  const toggleSeries = (k) => {
    const next = { ...hidden, [k]: !hidden[k] }
    setHidden(next)
    try { localStorage.setItem(SERIES_KEY, JSON.stringify(next)) } catch { /* private mode */ }
  }

  const allGoals = liveGoals(goals)
  const enabled = allGoals.filter((g) => g.enabled)
  const todayT = dateT(today)

  const data = useMemo(() => {
    const rows = (snapshots ?? [])
      .filter((s) => s.date !== today)
      .map((s) => ({ t: dateT(s.date), seen: s.seen, known: s.known, context: s.context }))
    rows.push({ t: todayT, seen: counts.seen, known: counts.known, context: counts.context })
    return rows.sort((a, b) => a.t - b.t)
  }, [snapshots, today, todayT, counts])

  const goalLines = enabled.map((g, i) => {
    const endT = dateT(goalEndDate(g))
    const startT = dateT(g.startDate)
    return {
      id: g.id,
      label: g.label,
      color: GOAL_COLORS[allGoals.indexOf(g) % GOAL_COLORS.length],
      endT,
      data: [
        { t: Math.max(startT, data[0].t), v: goalStartValue(g, snapshots, counts.known) },
        { t: endT, v: g.target },
      ],
    }
  })

  const firstT = data[0].t
  const lastT = Math.max(todayT, ...goalLines.map((l) => l.endT))
  const domain = [firstT, lastT > firstT ? lastT : firstT + DAY]
  // Explicit whole-day ticks so a short span never yields duplicate labels.
  const spanDays = Math.round((domain[1] - domain[0]) / DAY)
  const tickN = Math.min(4, spanDays)
  const ticks = [...new Set(Array.from({ length: tickN + 1 }, (_, i) => domain[0] + Math.round((spanDays * i) / tickN) * DAY))]

  return (
    <div className="rounded-2xl border border-ink/10 bg-white/50 p-4">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart margin={{ top: 8, right: 36, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#1a161412" />
          <XAxis
            dataKey="t" type="number" scale="time" domain={domain}
            ticks={ticks} tickFormatter={fmtTick} tick={{ fontSize: 10 }}
          />
          <YAxis tick={{ fontSize: 10 }} width={44} />
          <Tooltip
            content={({ active, label }) => {
              if (!active || label == null) return null
              const row = data.find((r) => r.t === label)
              if (!row) return null
              return (
                <div className="rounded-lg border border-ink/10 bg-paper px-3 py-2 font-mono text-[11px] shadow">
                  <div className="mb-1 text-ink/60">{new Date(label).toISOString().slice(0, 10)}</div>
                  {SERIES.map((s) => (
                    <div key={s.key} style={{ color: s.color }}>{s.label}: {row[s.key]}</div>
                  ))}
                </div>
              )
            }}
          />
          {SERIES.filter((s) => !hidden[s.key]).map((s) => (
            <Line
              key={s.key} data={data} dataKey={s.key} name={s.label} type="monotone"
              stroke={s.color} strokeWidth={s.width} dot={data.length < 3} isAnimationActive={false}
            />
          ))}
          {goalLines.map((l) => (
            <Line
              key={l.id} data={l.data} dataKey="v" name={l.label} stroke={l.color}
              strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false}
              legendType="none" activeDot={false}
              label={({ x, y, index }) => index === 1 ? (
                <text x={x} y={y - 6} textAnchor="end" fontSize={10} fill={l.color}>{l.label}</text>
              ) : null}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap gap-2">
        {SERIES.map((s) => (
          <Chip key={s.key} on={!hidden[s.key]} color={s.color} onClick={() => toggleSeries(s.key)}>{s.label}</Chip>
        ))}
        {allGoals.map((g, i) => (
          <Chip key={g.id} on={g.enabled} color={GOAL_COLORS[i % GOAL_COLORS.length]} onClick={() => onToggleGoal(g.id)}>
            {g.label}
          </Chip>
        ))}
      </div>
    </div>
  )
}
