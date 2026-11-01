import React, { useMemo, useState } from 'react'
import { parsePlecoXml, classifyAll, applyPlecoImport, newKeysByList, DEFAULT_CATEGORY } from '../lib/pleco.js'

// ListsView → 匯入 Pleco (DESIGN §9, Phase 9). Additive: creates lists, custom items and notes only.
export default function PlecoImport({ index, progress, updateProgress, onClose }) {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(null)
  const [parsed, setParsed] = useState(null) // { cards, errors, results }
  const [choice, setChoice] = useState({}) // card idx -> candidate key | '__outside' | '__skip'
  const [summary, setSummary] = useState(null)

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFileName(f.name)
    setText(await f.text())
    setParsed(null)
    setSummary(null)
  }

  const preview = async () => {
    setSummary(null)
    setChoice({})
    const { cards, errors } = parsePlecoXml(text, DOMParser)
    setBusy(`0 / ${cards.length}`)
    const results = await classifyAll(cards, index, (d, n) => setBusy(`${d} / ${n}`))
    setBusy(null)
    setParsed({ cards, errors, results })
  }

  const resolveRows = useMemo(
    () => (parsed ? parsed.results.map((r, i) => (r.status === 'resolve' ? i : -1)).filter((i) => i >= 0) : []),
    [parsed]
  )
  const unresolved = resolveRows.filter((i) => !choice[i]).length

  const perCategory = useMemo(() => {
    const out = {}
    if (!parsed) return out
    parsed.cards.forEach((c, i) => {
      const r = parsed.results[i]
      let st = r.status
      if (st === 'resolve' && choice[i]) st = choice[i] === '__outside' ? 'outside' : choice[i] === '__skip' ? 'skip' : 'auto'
      for (const cat of c.categories.length ? c.categories : [DEFAULT_CATEGORY]) {
        out[cat] = out[cat] ?? { auto: 0, outside: 0, resolve: 0, skip: 0 }
        out[cat][st]++
      }
    })
    return out
  }, [parsed, choice])

  const doImport = () => {
    const decisions = parsed.cards.map((card, i) => {
      const r = parsed.results[i]
      if (r.status === 'auto') return { card, kind: 'key', key: r.key }
      if (r.status === 'outside') return { card, kind: 'outside' }
      const c = choice[i]
      if (c === '__outside') return { card, kind: 'outside' }
      if (c === '__skip' || !c) return { card, kind: 'skip' }
      return { card, kind: 'key', key: c }
    })
    const before = progress
    const after = applyPlecoImport(before, decisions, fileName, new Date())
    const added = newKeysByList(before, after)
    updateProgress(() => after)
    const lines = Object.values(added).map(({ name, added: keys }) => {
      const outside = keys.filter((k) => after.customItems?.[k]?.tags?.includes('outside-TOCFL')).length
      return keys.length
        ? `Imported ${keys.length} words into ${name} (${keys.length - outside} TOCFL/CCC, ${outside} outside-TOCFL)`
        : `${name}: 0 new words`
    })
    setSummary(lines.length ? lines : ['0 new words'])
    setParsed(null)
    setText('')
  }

  return (
    <div className="mb-3 flex flex-col gap-3 rounded-xl border border-ink/10 bg-white/60 p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-display text-sm font-bold text-ink">匯入 Pleco · Import Pleco XML</h4>
        <button onClick={onClose} className="font-sans text-xs text-ink/50">Close</button>
      </div>

      {summary && (
        <div className="rounded-lg bg-jade/10 p-3 font-sans text-sm text-jade">
          {summary.map((s) => <p key={s}>{s}</p>)}
        </div>
      )}

      <input type="file" accept=".xml,text/xml" onChange={onFile} className="font-sans text-xs" />
      <textarea
        value={text} onChange={(e) => { setText(e.target.value); setParsed(null) }} rows={4}
        placeholder="…or paste the Pleco XML here"
        className="w-full rounded-lg border border-ink/15 bg-transparent px-3 py-2 font-mono text-xs"
      />
      <button
        onClick={preview} disabled={!text.trim() || !!busy}
        className="self-start rounded-full border border-ink/20 px-4 py-1.5 font-sans text-sm text-ink/80 disabled:opacity-40"
      >
        {busy ? `Reading… ${busy}` : 'Preview'}
      </button>

      {parsed && (
        <>
          {parsed.errors.map((e) => <p key={e} className="font-mono text-xs text-cinnabar">{e}</p>)}
          {parsed.cards.length > 0 && (
            <div className="flex flex-col gap-1">
              {Object.entries(perCategory).map(([cat, n]) => (
                <p key={cat} className="font-sans text-sm text-ink/80">
                  <b>{cat}</b>: {n.auto} auto · {n.outside} outside-TOCFL · {n.resolve} need resolving{n.skip ? ` · ${n.skip} skipped` : ''}
                </p>
              ))}
            </div>
          )}

          {resolveRows.map((i) => {
            const c = parsed.cards[i]
            const r = parsed.results[i]
            const name = `res-${i}`
            return (
              <div key={i} className="rounded-lg border border-ink/10 p-3">
                <p className="font-sans text-sm">
                  <span className="font-display text-base text-ink">{c.tc || c.sc}</span>{' '}
                  <span className="font-mono text-xs text-cinnabar">{c.pinyin}</span>
                  {r.reason && <span className="ml-2 font-mono text-[10px] text-ink/40">{r.reason}</span>}
                </p>
                <p className="mb-2 font-sans text-xs text-ink/50">{c.defn.slice(0, 80)}</p>
                {r.candidates.map((k) => {
                  const it = index.get(k)
                  return (
                    <label key={k} className="flex min-h-[40px] items-center gap-2 font-sans text-sm">
                      <input type="radio" name={name} checked={choice[i] === k} onChange={() => setChoice((p) => ({ ...p, [i]: k }))} />
                      {it?.hanzi} {it?.pinyin}{it?.pos ? ` (${it.pos})` : ''} — {it?.english} [{it?.level ?? it?.band ?? '–'}]
                    </label>
                  )
                })}
                <label className="flex min-h-[40px] items-center gap-2 font-sans text-sm">
                  <input type="radio" name={name} checked={choice[i] === '__outside'} onChange={() => setChoice((p) => ({ ...p, [i]: '__outside' }))} />
                  Not in TOCFL (outside)
                </label>
                <label className="flex min-h-[40px] items-center gap-2 font-sans text-sm">
                  <input type="radio" name={name} checked={choice[i] === '__skip'} onChange={() => setChoice((p) => ({ ...p, [i]: '__skip' }))} />
                  Skip
                </label>
              </div>
            )
          })}

          {parsed.cards.length > 0 && (
            <button
              onClick={doImport} disabled={unresolved > 0}
              className="self-start rounded-full bg-cinnabar px-5 py-2 font-display text-sm font-bold text-paper disabled:opacity-40"
            >
              Import{unresolved > 0 ? ` (${unresolved} to resolve)` : ''}
            </button>
          )}
        </>
      )}
    </div>
  )
}
