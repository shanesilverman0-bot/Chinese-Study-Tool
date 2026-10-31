import React, { useState } from 'react'
import { localDate } from '../lib/dates.js'
import { newId } from '../lib/ids.js'

const TYPES = ['listening', 'reading', 'writing', 'speaking', 'vocabulary', 'grammar', 'other']
const MATERIALS = ['當代中文課程', 'TOCFL 模擬考', 'Podcast', 'YouTube', '新聞', '小說/書', '語言交換', '家教']
const OTHER = '__other'

const blank = (tz) => ({
  id: null, date: localDate(new Date(), tz), durationMin: '', practiceType: 'listening', practiceTypeOther: '',
  materialSel: MATERIALS[0], materialOther: '', notes: '',
})

const input = 'w-full rounded-lg border border-ink/20 bg-white/70 px-3 py-2 font-sans text-sm text-ink'

export default function ManualEntryForm({ entries, tz, upsertManualEntry, onClose }) {
  const [f, setF] = useState(() => blank(tz))
  const [err, setErr] = useState('')
  const set = (patch) => setF((p) => ({ ...p, ...patch }))

  const recent = (entries ?? [])
    .filter((e) => !e.deleted)
    .sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || '')))
    .slice(0, 10)

  const edit = (e) => {
    const preset = MATERIALS.includes(e.material)
    set({
      id: e.id, date: e.date, durationMin: String(e.durationMin), practiceType: e.practiceType,
      practiceTypeOther: e.practiceTypeOther || '', materialSel: preset ? e.material : OTHER,
      materialOther: preset ? '' : e.material, notes: e.notes || '',
    })
  }

  const save = () => {
    const min = Number(f.durationMin)
    if (!Number.isInteger(min) || min < 1 || min > 600) return setErr('Minutes must be a whole number from 1 to 600.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return setErr('Pick a date.')
    const now = new Date().toISOString()
    const old = f.id ? entries.find((e) => e.id === f.id) : null
    upsertManualEntry({
      id: f.id || newId('man'),
      date: f.date,
      durationMin: min,
      practiceType: f.practiceType,
      practiceTypeOther: f.practiceType === 'other' ? f.practiceTypeOther.trim() : '',
      material: f.materialSel === OTHER ? f.materialOther.trim() : f.materialSel,
      notes: f.notes.trim(),
      extra: old?.extra ?? {},
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
    })
    setErr('')
    setF(blank(tz))
  }

  const remove = (e) => {
    if (!window.confirm('Delete this entry?')) return
    upsertManualEntry({ ...e, deleted: true, updatedAt: new Date().toISOString() })
    if (f.id === e.id) setF(blank(tz))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-paper p-5 text-ink shadow-xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-base font-bold">手動紀錄 · Manual entry</h3>
          <button onClick={onClose} className="font-mono text-sm text-ink/50">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="font-mono text-[10px] uppercase text-ink/50">Date
            <input type="date" className={input} value={f.date} onChange={(e) => set({ date: e.target.value })} />
          </label>
          <label className="font-mono text-[10px] uppercase text-ink/50">Minutes
            <input type="number" inputMode="numeric" min="1" max="600" className={input} value={f.durationMin} onChange={(e) => set({ durationMin: e.target.value })} />
          </label>
          <label className="font-mono text-[10px] uppercase text-ink/50">Practice type
            <select className={input} value={f.practiceType} onChange={(e) => set({ practiceType: e.target.value })}>
              {TYPES.map((t) => <option key={t} value={t}>{t === 'other' ? 'Other…' : t}</option>)}
            </select>
          </label>
          {f.practiceType === 'other' ? (
            <label className="font-mono text-[10px] uppercase text-ink/50">Type (other)
              <input className={input} value={f.practiceTypeOther} onChange={(e) => set({ practiceTypeOther: e.target.value })} />
            </label>
          ) : <div />}
          <label className="font-mono text-[10px] uppercase text-ink/50">Material
            <select className={input} value={f.materialSel} onChange={(e) => set({ materialSel: e.target.value })}>
              {MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
              <option value={OTHER}>Other…</option>
            </select>
          </label>
          {f.materialSel === OTHER ? (
            <label className="font-mono text-[10px] uppercase text-ink/50">Material (other)
              <input className={input} value={f.materialOther} onChange={(e) => set({ materialOther: e.target.value })} />
            </label>
          ) : <div />}
        </div>
        <label className="mt-3 block font-mono text-[10px] uppercase text-ink/50">Notes
          <textarea rows={2} className={input} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
        {err && <p className="mt-2 font-sans text-xs text-cinnabar">{err}</p>}
        <div className="mt-3 flex gap-2">
          <button onClick={save} className="flex-1 rounded-xl bg-cinnabar py-2.5 font-display font-bold text-paper">
            {f.id ? 'Update' : 'Add'}
          </button>
          {f.id && <button onClick={() => setF(blank(tz))} className="rounded-xl border border-ink/20 px-4 font-sans text-sm">Cancel edit</button>}
        </div>

        <h4 className="mb-2 mt-5 font-mono text-[10px] uppercase tracking-widest text-ink/45">Last 10 entries</h4>
        {recent.length === 0 && <p className="font-sans text-xs text-ink/40">No entries yet.</p>}
        <ul className="divide-y divide-ink/10">
          {recent.map((e) => (
            <li key={e.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="font-sans text-sm">
                  {e.date} · {e.practiceType === 'other' ? e.practiceTypeOther || 'other' : e.practiceType} · {e.durationMin} min
                </div>
                <div className="truncate font-sans text-xs text-ink/50">{e.material}{e.notes ? ` — ${e.notes}` : ''}</div>
              </div>
              <button onClick={() => edit(e)} className="font-sans text-xs text-ink/60 underline">Edit</button>
              <button onClick={() => remove(e)} className="font-sans text-xs text-cinnabar underline">Delete</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
