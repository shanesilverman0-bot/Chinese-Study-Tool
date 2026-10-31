import React, { useMemo, useState } from 'react'
import { TOCFLMasteryPanel, CCCCMasteryPanel } from './MasteryPanels.jsx'
import ListDetail from './ListDetail.jsx'
import { buildFlashcardQueue } from '../lib/queue.js'
import { createCustomList, itemStatus } from '../lib/lists.js'

const GROUPS = [
  ['ccc', '當代中文 · Contemporary Chinese'],
  ['pleco', 'Pleco'],
  ['custom', '自訂 · Custom'],
]
const fmt = (n) => n.toLocaleString('en-US')

export default function ListsView({ lists, index, progress, baseline, vocab, upsertList, deleteList, onStudyList }) {
  const [openId, setOpenId] = useState(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const settings = progress.studySettings

  // due·new·known per list (baseline words count in `new`'s sibling only through the status chip).
  const stats = useMemo(() => {
    const out = new Map()
    for (const l of lists) {
      const { stats: s } = buildFlashcardQueue({
        selection: { listIds: [l.id], tocflLevels: [], includeBaseline: true, size: null, newMax: null },
        lists, index, progress, baseline,
      })
      let known = 0
      for (const k of l.itemKeys) if (itemStatus(k, { index, cards: progress.cards, baseline, settings }) === 'known') known++
      out.set(l.id, { due: s.due, fresh: s.fresh, known })
    }
    return out
  }, [lists, index, progress.cards, baseline, settings]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = openId ? lists.find((l) => l.id === openId) : null
  if (open) {
    return (
      <ListDetail
        list={open} index={index} progress={progress} baseline={baseline}
        upsertList={upsertList}
        onBack={() => setOpenId(null)}
        onDelete={() => { deleteList(open.id); setOpenId(null) }}
        onStudy={() => onStudyList(open.id)}
      />
    )
  }

  const create = () => {
    const l = createCustomList(newName)
    upsertList(l)
    setNewName('')
    setCreating(false)
    setOpenId(l.id)
  }

  return (
    <div className="brush-in flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <h3 className="font-display text-base font-bold text-ink">概覽 · Overview</h3>
        <TOCFLMasteryPanel vocab={vocab} progress={progress} />
        <CCCCMasteryPanel vocab={vocab} progress={progress} />
      </section>

      {GROUPS.map(([type, title]) => {
        const group = lists.filter((l) => l.sourceType === type)
        return (
          <section key={type} className="rounded-2xl border border-ink/10 bg-white/50 p-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold tracking-wide text-ink/70">{title}</h3>
              {type === 'custom' && !creating && (
                <button onClick={() => setCreating(true)} className="rounded-full border border-ink/20 px-3 py-1 font-sans text-xs text-ink/70 hover:border-jade hover:text-jade">
                  新清單 · New custom list
                </button>
              )}
            </div>
            {type === 'custom' && creating && (
              <div className="mb-3 flex gap-2">
                <input
                  autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') create() }}
                  placeholder="List name" className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-transparent px-3 py-2 font-sans text-sm"
                />
                <button onClick={create} className="rounded-lg bg-cinnabar px-4 font-sans text-sm text-paper">Create</button>
                <button onClick={() => setCreating(false)} className="px-2 font-sans text-sm text-ink/50">Cancel</button>
              </div>
            )}
            {group.length === 0 && (
              <p className="font-sans text-sm text-ink/50">
                {type === 'pleco' ? 'No Pleco lists yet (import comes in a later update).' : type === 'custom' ? 'No custom lists yet.' : 'No CCC lists.'}
              </p>
            )}
            <div className="flex flex-col">
              {group.map((l) => {
                const s = stats.get(l.id) ?? { due: 0, fresh: 0, known: 0 }
                return (
                  <button key={l.id} onClick={() => setOpenId(l.id)} className="flex min-h-[40px] items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-ink/5">
                    <span className="min-w-0 flex-1 truncate font-sans text-sm text-ink/80">{l.name}</span>
                    <span className="font-mono text-[11px] text-ink/45">
                      {fmt(l.itemKeys.length)} · <span className={s.due ? 'text-cinnabar' : ''}>{fmt(s.due)}</span>·{fmt(s.fresh)}·{fmt(s.known)}
                    </span>
                  </button>
                )
              })}
            </div>
            {group.length > 0 && <p className="mt-2 font-mono text-[10px] text-ink/35">items · due·new·known</p>}
          </section>
        )
      })}
    </div>
  )
}
