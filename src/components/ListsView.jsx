import React, { useMemo, useState } from 'react'
import { TOCFLMasteryPanel, CCCTree, StatusBar, StatusNums, StatusLegend } from './MasteryPanels.jsx'
import ListDetail from './ListDetail.jsx'
import PlecoImport from './PlecoImport.jsx'
import { useWide } from '../lib/layout.js'
import { createCustomList, statusSummary } from '../lib/lists.js'

const GROUPS = [
  ['ccc', '當代中文 · Contemporary Chinese'],
  ['pleco', 'Pleco'],
  ['custom', '自訂 · Custom'],
]
export default function ListsView({ lists, index, progress, baseline, vocab, upsertList, deleteList, updateProgress, deviceSettings, onStudyList }) {
  const [openId, setOpenId] = useState(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [treeOpen, setTreeOpen] = useState({ books: {}, chapters: {} })
  const settings = progress.studySettings
  const wide = useWide()

  // One context object so the memoised summaries recompute only when cards/baseline/settings change.
  const ctx = useMemo(
    () => ({ index, cards: progress.cards, baseline, settings }),
    [index, progress.cards, baseline, settings]
  )
  // due·new·known + bar for Pleco and custom lists (CCC rows are summarised inside CCCTree).
  const stats = useMemo(() => {
    const out = new Map()
    for (const l of lists) if (l.sourceType !== 'ccc') out.set(l.id, statusSummary(l.itemKeys, ctx))
    return out
  }, [lists, ctx])

  const open = openId ? lists.find((l) => l.id === openId) : null
  if (open) {
    return (
      <ListDetail
        list={open} index={index} progress={progress} baseline={baseline}
        upsertList={upsertList} updateProgress={updateProgress} deviceSettings={deviceSettings}
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
    <div className={`brush-in gap-5 ${wide ? 'grid grid-cols-2 items-start' : 'flex flex-col'}`}>
      <section className="flex flex-col gap-3">
        <h3 className="font-display text-base font-bold text-ink">概覽 · Overview</h3>
        <TOCFLMasteryPanel vocab={vocab} ctx={ctx} />
      </section>

      {GROUPS.map(([type, title]) => {
        const group = lists.filter((l) => l.sourceType === type)
        return (
          <section key={type} className="rounded-2xl border border-ink/10 bg-white/50 p-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold tracking-wide text-ink/70">{title}</h3>
              {type === 'pleco' && !importing && (
                <button onClick={() => setImporting(true)} className="rounded-full border border-ink/20 px-3 py-1 font-sans text-xs text-ink/70 hover:border-jade hover:text-jade">
                  匯入 Pleco
                </button>
              )}
              {type === 'custom' && !creating && (
                <button onClick={() => setCreating(true)} className="rounded-full border border-ink/20 px-3 py-1 font-sans text-xs text-ink/70 hover:border-jade hover:text-jade">
                  新清單 · New custom list
                </button>
              )}
            </div>
            {type === 'pleco' && importing && (
              <PlecoImport index={index} progress={progress} updateProgress={updateProgress} onClose={() => setImporting(false)} />
            )}
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
            {type === 'ccc' && <CCCTree lists={group} ctx={ctx} onOpen={setOpenId} open={treeOpen} setOpen={setTreeOpen} />}
            {type !== 'ccc' && group.length === 0 && (
              <p className="font-sans text-sm text-ink/50">
                {type === 'pleco' ? 'No Pleco lists yet. Use 匯入 Pleco to import a flashcard XML export.' : type === 'custom' ? 'No custom lists yet.' : 'No CCC lists.'}
              </p>
            )}
            {type !== 'ccc' && (
              <div className="flex flex-col">
                {group.map((l) => {
                  const s = stats.get(l.id)
                  return (
                    <button key={l.id} onClick={() => setOpenId(l.id)} className="flex min-h-[40px] flex-col rounded-lg px-2 py-1.5 text-left hover:bg-ink/5">
                      <span className="flex w-full items-baseline justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate font-sans text-sm text-ink/80">{l.name}</span>
                        {s && <StatusNums s={s} />}
                      </span>
                      <span className="w-full"><StatusBar s={s} /></span>
                    </button>
                  )
                })}
              </div>
            )}
            {(type === 'ccc' || group.length > 0) && <StatusLegend />}
          </section>
        )
      })}
    </div>
  )
}
