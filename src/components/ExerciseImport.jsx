import React, { useEffect, useMemo, useState } from 'react'
import promptRaw from '../../docs/prompts/generate-exercises.md?raw'
import { batchesOf, buildInputFile, inputFileName, nextVariant } from '../lib/exerciseInput.js'
import { validateExerciseFile } from '../lib/exerciseValidator.js'
import { fileIdFor, pathFor, saveExerciseFile, loadExerciseFile } from '../lib/exerciseStore.js'
import { effectiveGithub } from '../lib/dataMode.js'
import { questionRef } from '../lib/context.js'

const REVIEW_FORMAT = 'tocfl-tutor.exercise-review'
const DISABLING = new Set(['ambiguous', 'wrong-answer'])
const WARNING = new Set(['unnatural', 'above-level', 'not-taiwan'])

// DESIGN §10.6: match findings by exId among this list's loaded files. Pure.
// → { fatal } | { review: true, matches: [{ ref, fileId, status, reason }], fileIds, unknown, ok, disabled, warnings }
function planReview(text, contents) {
  let json
  try { json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) } catch (e) { return { fatal: `Not valid JSON: ${e.message}` } }
  if (!Array.isArray(json.findings)) return { fatal: 'Review file has no findings array.' }
  const byEx = new Map()
  for (const [fileId, f] of Object.entries(contents)) for (const ex of f?.exercises ?? []) byEx.set(ex.id, { fileId, ex })
  const matches = []
  const unknown = []
  const fileIds = new Set()
  let ok = 0
  for (const fd of json.findings) {
    const hit = byEx.get(fd?.exId)
    const q = fd?.q ?? 0
    if (!hit || !Number.isInteger(q) || q < 0 || q >= (hit.ex.questions?.length ?? 0)) { unknown.push(`${fd?.exId ?? '?'}${hit ? `#${q}` : ''}`); continue }
    fileIds.add(hit.fileId)
    if (fd.verdict === 'ok') { ok++; continue }
    const status = DISABLING.has(fd.verdict) ? 'disabled' : WARNING.has(fd.verdict) ? 'warning' : null
    if (!status) { unknown.push(`${fd.exId} (verdict "${fd.verdict}")`); continue }
    const reason = [fd.verdict, fd.note, fd.alternative ? `alternative: ${fd.alternative}` : ''].filter(Boolean).join(' · ')
    matches.push({ ref: questionRef(hit.fileId, hit.ex.id, q), fileId: hit.fileId, status, reason })
  }
  return {
    review: true, matches, fileIds: [...fileIds], unknown, ok,
    disabled: matches.filter((m) => m.status === 'disabled').length,
    warnings: matches.filter((m) => m.status === 'warning').length,
  }
}

// The prompt proper is everything below the "---" line (above it are usage notes for Shane).
const PROMPT = promptRaw.includes('\n---\n') ? promptRaw.slice(promptRaw.indexOf('\n---\n') + 5).trim() : promptRaw

const BTN = 'rounded-full border border-ink/20 px-3 py-1.5 font-sans text-xs text-ink/70 hover:border-jade hover:text-jade'
const BTN_PRIMARY = 'rounded-full bg-cinnabar px-4 py-1.5 font-display text-sm font-bold text-paper disabled:opacity-40'

// ListDetail → 練習題 · Exercises (DESIGN §10, Phase 11): export input, check and import the AI's output.
export default function ExerciseImport({ list, index, progress, updateProgress, settings }) {
  const cfg = useMemo(() => effectiveGithub(settings), [settings])
  const batches = useMemo(() => batchesOf(list), [list])
  const metas = useMemo(
    () => Object.values(progress.exerciseFiles ?? {})
      .filter((m) => m && !m.deleted && m.listId === list.id)
      .sort((a, b) => a.batch - b.batch || a.variant - b.variant),
    [progress.exerciseFiles, list.id]
  )

  const [batch, setBatch] = useState(1)
  const [variant, setVariant] = useState(() => nextVariant(progress.exerciseFiles, list.id, 1))
  const [contents, setContents] = useState({}) // fileId -> parsed file
  const [msg, setMsg] = useState('')
  const [text, setText] = useState('')
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(false)

  // Existing file contents feed `avoid` and the validator's duplicate checks.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const next = {}
      for (const m of metas) next[m.id] = await loadExerciseFile(cfg, m)
      if (alive) setContents(next)
    })()
    return () => { alive = false }
  }, [metas, cfg])
  const existingFiles = useMemo(() => Object.values(contents).filter(Boolean), [contents])

  const pickBatch = (b) => {
    setBatch(b)
    setVariant(nextVariant(progress.exerciseFiles, list.id, b))
  }

  const inputJson = () => JSON.stringify(buildInputFile({ list, batch, variant, index, existingFiles }), null, 2)
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500) }
  const copy = async (s, label) => {
    try { await navigator.clipboard.writeText(s); flash(`${label} copied.`) } catch { flash('Copy failed. Use Download instead.') }
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([inputJson()], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = inputFileName(list.id, batch, variant)
    a.click()
    URL.revokeObjectURL(url)
  }

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setText(await f.text())
    setReport(null)
    e.target.value = ''
  }

  const check = () => {
    if (text.includes(REVIEW_FORMAT)) { setReport(planReview(text, contents)); return }
    // Expected targets: the batch the file claims. Peek at it so the plan check can run.
    let batchNo = null
    try { batchNo = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)).batch } catch { /* validator reports it */ }
    const expectedTargets = Number.isInteger(batchNo) ? batches[batchNo - 1] : undefined
    setReport(validateExerciseFile(text, { itemIndex: index, listId: list.id, existingFiles, expectedTargets }))
  }

  const applyReview = () => {
    if (!report?.review) return
    const now = new Date().toISOString()
    updateProgress((prev) => {
      const flags = { ...(prev.exerciseFlags ?? {}) }
      for (const m of report.matches) {
        if (flags[m.ref]?.from === 'user') continue // a manual choice outranks the verify pass
        flags[m.ref] = { status: m.status, reason: m.reason, from: 'verify-pass', at: now }
      }
      const files = { ...(prev.exerciseFiles ?? {}) }
      for (const id of report.fileIds) if (files[id]) files[id] = { ...files[id], reviewed: true, updatedAt: now }
      return { ...prev, exerciseFlags: flags, exerciseFiles: files }
    })
    flash(`${report.disabled} question${report.disabled === 1 ? '' : 's'} disabled, ${report.warnings} warning${report.warnings === 1 ? '' : 's'}`)
    setText('')
    setReport(null)
  }

  const reenable = (ref) => {
    const now = new Date().toISOString()
    updateProgress((prev) => ({
      ...prev,
      exerciseFlags: { ...(prev.exerciseFlags ?? {}), [ref]: { status: 'warning', reason: 'Re-enabled by user', from: 'user', at: now } },
    }))
  }

  const doImport = async () => {
    if (!report?.ok) return
    setBusy(true)
    try {
      const now = new Date().toISOString()
      const body = { ...report.file, importedAt: now, exercises: report.accepted }
      const id = fileIdFor(list.id, report.file.batch, report.file.variant, JSON.stringify(report.accepted))
      const meta = {
        id, listId: list.id, batch: report.file.batch, variant: report.file.variant, itemType: report.file.itemType,
        path: pathFor(list.id, id), importedAt: now, generator: report.file.generator,
        counts: {
          exercises: report.accepted.length,
          questions: report.accepted.reduce((n, x) => n + x.questions.length, 0),
          rejected: report.rejected.length,
        },
        targets: [...new Set(report.accepted.flatMap((x) => x.targets))],
        reviewed: false, updatedAt: now,
      }
      const { remote } = await saveExerciseFile(cfg, meta, body)
      updateProgress((prev) => ({ ...prev, exerciseFiles: { ...(prev.exerciseFiles ?? {}), [id]: meta } }))
      setContents((c) => ({ ...c, [id]: body }))
      flash(`Imported ${meta.counts.exercises} exercises${remote ? '.' : ' (saved on this device only).'}`)
      setText('')
      setReport(null)
      setVariant(nextVariant({ ...(progress.exerciseFiles ?? {}), [id]: meta }, list.id, batch))
    } catch (e) {
      flash(`Import failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const remove = (m) => {
    if (!window.confirm(`Delete ${m.id}? The file stays in the repo; only the app entry is removed.`)) return
    updateProgress((prev) => ({
      ...prev,
      exerciseFiles: { ...(prev.exerciseFiles ?? {}), [m.id]: { ...m, deleted: true, updatedAt: new Date().toISOString() } },
    }))
  }

  const disabledIn = (m) => {
    const out = []
    for (const ex of contents[m.id]?.exercises ?? []) {
      ;(ex.questions ?? []).forEach((qu, q) => {
        const ref = questionRef(m.id, ex.id, q)
        if (progress.exerciseFlags?.[ref]?.status !== 'disabled') return
        out.push({ ref, label: `${ex.id.split('-').slice(-1)[0]} · ${qu.target?.split('|')[0] ?? ''} · ${qu.prompt ?? ex.sentence ?? ex.passage ?? ''}` })
      })
    }
    return out
  }

  if (batches.length === 0) return <p className="py-4 text-center font-sans text-sm text-ink/50">Add words to this list first.</p>

  const sel = 'rounded-lg border border-ink/15 bg-transparent px-2 py-1.5 font-sans text-sm text-ink'
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-2xl border border-ink/10 bg-white/50 p-4">
        <h4 className="font-display text-sm font-bold text-ink">1 · Generate</h4>
        <div className="flex flex-wrap items-center gap-3 font-sans text-sm text-ink/70">
          <label className="flex items-center gap-1.5">Batch
            <select value={batch} onChange={(e) => pickBatch(Number(e.target.value))} className={sel}>
              {batches.map((b, i) => <option key={i} value={i + 1}>{i + 1} ({b.length} words)</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5">Variant
            <select value={variant} onChange={(e) => setVariant(Number(e.target.value))} className={sel}>
              {Array.from({ length: Math.max(4, variant) }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={download} className={BTN}>Download input file</button>
          <button onClick={() => copy(inputJson(), 'Input JSON')} className={BTN}>Copy input JSON</button>
          <button onClick={() => copy(PROMPT, 'Prompt')} className={BTN}>Copy prompt</button>
        </div>
        {msg && <p className="font-mono text-xs text-jade">{msg}</p>}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-ink/10 bg-white/50 p-4">
        <h4 className="font-display text-sm font-bold text-ink">2 · Import</h4>
        <textarea
          value={text} onChange={(e) => { setText(e.target.value); setReport(null) }}
          placeholder="Paste the AI's exercise JSON, or a review file" rows={6}
          className="w-full rounded-lg border border-ink/15 bg-transparent p-2 font-mono text-xs text-ink"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input type="file" accept=".json,application/json,text/plain" onChange={onFile} className="font-sans text-xs text-ink/60" />
          <button onClick={check} disabled={!text.trim()} className={BTN}>Check</button>
        </div>

        {report && (
          <div className="flex flex-col gap-2 font-sans text-sm text-ink/80">
            {report.fatal ? (
              <p className="rounded-lg bg-cinnabar/10 p-2 text-cinnabar">{report.fatal}</p>
            ) : report.review ? (
              <>
                <p className="font-mono text-xs text-ink/60">Review file</p>
                <p><b className="text-cinnabar">{report.disabled} question{report.disabled === 1 ? '' : 's'} disabled</b>, <b className="text-[#b8860b]">{report.warnings} warning{report.warnings === 1 ? '' : 's'}</b>, {report.ok} ok</p>
                {report.unknown.length > 0 && (
                  <div className="rounded-lg bg-[#b8860b]/10 p-2">
                    <p className="font-mono text-xs text-[#b8860b]">Unknown ids (not in this list's files)</p>
                    <ul className="list-disc pl-5 text-xs">{report.unknown.map((x, j) => <li key={j}>{x}</li>)}</ul>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="font-mono text-xs text-ink/60">
                  Batch {report.file.batch} · variant {report.file.variant} · {report.file.generator ?? 'unknown generator'}
                </p>
                <p><b className="text-jade">{report.accepted.length} accepted</b>, <b className={report.rejected.length ? 'text-cinnabar' : ''}>{report.rejected.length} rejected</b></p>
                {report.rejected.map((r, i) => (
                  <div key={i} className="rounded-lg bg-cinnabar/10 p-2">
                    <p className="font-mono text-xs text-cinnabar">{r.id}</p>
                    <ul className="list-disc pl-5 text-xs">{r.reasons.map((x, j) => <li key={j}>{x}</li>)}</ul>
                  </div>
                ))}
                {report.warnings.length > 0 && (
                  <div className="rounded-lg bg-[#b8860b]/10 p-2">
                    <p className="font-mono text-xs text-[#b8860b]">Warnings</p>
                    <ul className="list-disc pl-5 text-xs">{report.warnings.map((x, j) => <li key={j}>{x}</li>)}</ul>
                  </div>
                )}
              </>
            )}
            {report.review ? (
              <button onClick={applyReview} disabled={!report.fileIds.length} className={`self-start ${BTN_PRIMARY}`}>
                Apply review
              </button>
            ) : (
              <button onClick={doImport} disabled={busy || !report.ok} className={`self-start ${BTN_PRIMARY}`}>
                Import {report.accepted.length} exercises
              </button>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col">
        <h4 className="pb-1 font-display text-sm font-bold text-ink">已匯入 · Files</h4>
        {metas.length === 0 && <p className="py-2 font-sans text-sm text-ink/50">No exercise files yet.</p>}
        {metas.map((m) => (
          <div key={m.id} className="flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-1 border-b border-ink/5 py-1.5 font-sans text-xs text-ink/70">
            <span className="font-mono text-ink">b{m.batch} · v{m.variant}</span>
            <span>{m.counts?.questions ?? 0} questions</span>
            <span className="text-ink/45">{(m.importedAt ?? '').slice(0, 10)}</span>
            {m.reviewed && <span className="text-jade">reviewed ✓</span>}
            <button onClick={() => remove(m)} className="ml-auto text-ink/40 hover:text-cinnabar">Delete</button>
            {disabledIn(m).map((d) => (
              <div key={d.ref} className="flex w-full items-center gap-2 pl-3">
                <span className="min-w-0 flex-1 truncate text-ink/45 line-through" title={progress.exerciseFlags?.[d.ref]?.reason}>{d.label}</span>
                <button onClick={() => reenable(d.ref)} className="shrink-0 rounded-full border border-ink/20 px-2.5 py-1 text-ink/70 hover:border-jade hover:text-jade">Re-enable</button>
              </div>
            ))}
          </div>
        ))}
      </section>
    </div>
  )
}
