import React, { useState } from 'react'
import { EXAM_DATES, examById, goalEndDate } from '../data/exams.js'
import { liveGoals } from '../lib/pace.js'

const LR = EXAM_DATES.filter((e) => e.kind === 'LR')
const inputCls = 'w-full rounded-lg border border-ink/15 bg-paper px-2 py-1.5 font-sans text-sm'

function validate(g) {
  const errs = []
  if (!g.label.trim()) errs.push('Label is required.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g.startDate || '')) errs.push('Start date is required.')
  const end = goalEndDate(g)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end || '')) errs.push('End date is required.')
  else if (g.startDate && end <= g.startDate) errs.push('End date must be after the start date.')
  if (!(Number(g.target) > 0)) errs.push('Target must be greater than 0.')
  return errs
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-0.5 block font-mono text-[10px] uppercase tracking-widest text-ink/45">{label}</span>
      {children}
    </label>
  )
}

export default function GoalsEditor({ goals, onSave, onClose }) {
  // Edit a local copy; Save writes only goals that changed (each stamped with updatedAt).
  const [draft, setDraft] = useState(() => structuredClone(goals ?? []))
  const patch = (id, p) => setDraft((d) => d.map((g) => (g.id === id ? { ...g, ...p } : g)))
  const visible = liveGoals(draft)
  const errors = Object.fromEntries(visible.map((g) => [g.id, validate(g)]))
  const invalid = Object.values(errors).some((e) => e.length > 0)

  const add = () => {
    const id = `goal-${Date.now().toString(36)}`
    const today = new Date().toISOString().slice(0, 10)
    setDraft((d) => [...d, {
      id, label: 'New goal', metric: 'known', startDate: today, startValue: null,
      endDate: '', examId: null, target: 5000, enabled: true, updatedAt: '', isNew: true,
    }])
  }

  const save = () => {
    const now = new Date().toISOString()
    const before = new Map((goals ?? []).map((g) => [g.id, g]))
    const out = draft.map((g) => {
      const { isNew, ...clean } = g
      const prev = before.get(g.id)
      if (prev && JSON.stringify(prev) === JSON.stringify(clean)) return prev
      return { ...clean, updatedAt: now }
    })
    onSave(out)
    onClose()
  }

  return (
    <div className="rounded-2xl border border-ink/10 bg-white/70 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-bold tracking-wide text-ink/70">目標 · Goals</h3>
        <button onClick={onClose} className="font-mono text-xs text-ink/50">Cancel</button>
      </div>

      <div className="space-y-4">
        {visible.map((g) => (
          <div key={g.id} className="space-y-2 rounded-xl border border-ink/10 p-3">
            <Field label="Label">
              <input className={inputCls} value={g.label} onChange={(e) => patch(g.id, { label: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Start date">
                <input type="date" className={inputCls} value={g.startDate} onChange={(e) => patch(g.id, { startDate: e.target.value })} />
              </Field>
              <Field label="Start value">
                <input
                  type="number" min="0" className={inputCls} placeholder="auto"
                  value={g.startValue ?? ''}
                  onChange={(e) => patch(g.id, { startValue: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </Field>
            </div>
            <Field label="End">
              <select
                className={inputCls}
                value={g.examId ?? ''}
                onChange={(e) => {
                  const ex = examById(e.target.value)
                  patch(g.id, ex ? { examId: ex.id, endDate: ex.date } : { examId: null })
                }}
              >
                <option value="">Custom date</option>
                {LR.map((e) => <option key={e.id} value={e.id}>TOCFL {e.date}</option>)}
              </select>
            </Field>
            {!g.examId && (
              <Field label="End date">
                <input type="date" className={inputCls} value={g.endDate} onChange={(e) => patch(g.id, { endDate: e.target.value })} />
              </Field>
            )}
            <div className="grid grid-cols-2 items-end gap-2">
              <Field label="Target (Known)">
                <input type="number" min="1" className={inputCls} value={g.target} onChange={(e) => patch(g.id, { target: Number(e.target.value) })} />
              </Field>
              <label className="flex items-center gap-2 pb-2 font-sans text-sm">
                <input type="checkbox" checked={g.enabled} onChange={(e) => patch(g.id, { enabled: e.target.checked })} className="h-4 w-4" />
                Enabled
              </label>
            </div>
            {errors[g.id].map((m) => <p key={m} className="font-sans text-xs text-cinnabar">{m}</p>)}
            <button onClick={() => patch(g.id, { deleted: true, enabled: false })} className="font-mono text-[11px] text-cinnabar underline">Delete</button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button onClick={add} className="font-mono text-xs text-ink/60 underline">+ Add goal</button>
        <button
          onClick={save}
          disabled={invalid}
          className={`rounded-xl px-5 py-2 font-display text-sm font-bold text-paper ${invalid ? 'cursor-not-allowed bg-ink/20' : 'bg-cinnabar'}`}
        >
          Save
        </button>
      </div>
    </div>
  )
}
