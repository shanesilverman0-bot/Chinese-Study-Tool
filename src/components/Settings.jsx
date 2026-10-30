import React, { useState } from 'react'
import { BANDS, BAND_LABELS } from '../data/vocab.js'
import { fetchProgress, putTextFile, verifyAccess } from '../lib/github.js'
import { DATA_MODE, dataPath } from '../lib/dataMode.js'
import { PROVIDERS } from '../lib/tutor.js'
import { CCC_VOCAB } from '../data/ccc.js'
import { THRESHOLD_EDGES, countingSettings } from '../lib/counts.js'
import MicTest from './MicTest.jsx'


function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="font-sans text-sm font-medium text-ink/80">{label}</span>
      {hint && <span className="mt-0.5 block font-mono text-[11px] text-ink/45">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

const inputCls =
  'w-full rounded-xl border border-ink/15 bg-white/60 px-3 py-2 font-mono text-sm text-ink outline-none focus:border-cinnabar'

export default function Settings({
  settings,
  updateSettings,
  syncState,
  pull,
  forcePush,
  saveNow,
  progress,
  baseline,
  updateStudySettings,
  onRecompute,
  replaceProgress,
  effectiveGh,
  vocabInfo,
  vocabCount,
  onReloadVocab,
}) {
  const [verify, setVerify] = useState({ status: 'idle', message: '' })

  const gh = settings.github
  const dataRepo = settings.data

  function setGh(patch) {
    updateSettings({ github: { ...gh, ...patch } })
  }

  function setDataRepo(patch) {
    updateSettings({ data: { ...dataRepo, ...patch } })
  }

  function toggleBand(band) {
    const enabled = new Set(settings.enabledBands)
    if (enabled.has(band)) enabled.delete(band)
    else enabled.add(band)
    updateSettings({ enabledBands: [...enabled] })
  }

  async function testGitHub() {
    setVerify({ status: 'checking', message: 'Checking…' })
    try {
      const res = await verifyAccess(effectiveGh)
      setVerify({
        status: 'ok',
        message: `Connected · write=${res.permissions?.push ? 'yes' : 'no'} · default=${res.defaultBranch}`,
      })
    } catch (e) {
      setVerify({ status: 'error', message: e.message })
    }
  }

  return (
    <div className="brush-in flex flex-col gap-6 pb-10">
      {/* GitHub sync */}
      <section className="rounded-2xl border border-ink/10 bg-white/50 p-5">
        <h3 className="mb-1 font-display text-base font-bold text-ink">資料庫 · Data repo</h3>
        <p className="mb-4 font-sans text-xs text-ink/50">
          Progress is saved in your private data repo, so the same app syncs across all devices.
          Use a fine-grained token with access only to this private repo (Contents: read and write).
        </p>
        <div className="flex flex-col gap-4">
          <Field label="Personal Access Token" hint="stored only in this browser's localStorage">
            <input
              type="password"
              className={inputCls}
              value={gh.token}
              onChange={(e) => setGh({ token: e.target.value })}
              placeholder="ghp_…"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Owner" hint="GitHub username">
              <input
                className={inputCls}
                value={dataRepo.owner}
                onChange={(e) => setDataRepo({ owner: e.target.value.trim() })}
              />
            </Field>
            <Field label="Data repo" hint="private">
              <input
                className={inputCls}
                value={dataRepo.repo}
                onChange={(e) => setDataRepo({ repo: e.target.value.trim() })}
              />
            </Field>
          </div>
          <p className="font-mono text-xs text-ink/45">
            file: <span className="text-ink/70">{effectiveGh.owner}/{effectiveGh.repo}:{effectiveGh.path}</span>
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={testGitHub}
              className="rounded-full border border-ink/20 px-4 py-1.5 font-sans text-sm text-ink/70 hover:border-jade hover:text-jade"
            >
              Test connection
            </button>
            <button
              onClick={pull}
              className="rounded-full border border-ink/20 px-4 py-1.5 font-sans text-sm text-ink/70 hover:border-cinnabar hover:text-cinnabar"
            >
              Pull
            </button>
            <button
              onClick={() => saveNow()}
              className="rounded-full border border-ink/20 px-4 py-1.5 font-sans text-sm text-ink/70 hover:border-cinnabar hover:text-cinnabar"
            >
              Push now
            </button>
          </div>

          {verify.status !== 'idle' && (
            <p
              className="font-mono text-xs"
              style={{
                color:
                  verify.status === 'ok' ? '#2d6a4f' : verify.status === 'error' ? '#c0392b' : '#b8860b',
              }}
            >
              {verify.message}
            </p>
          )}
          <p className="font-mono text-xs text-ink/45">
            sync: <span className="text-ink/70">{syncState.status}</span> — {syncState.message || '—'}
          </p>
        </div>
      </section>

      <DataSection
        progress={progress}
        replaceProgress={replaceProgress}
        forcePush={forcePush}
        effectiveGh={effectiveGh}
      />

      <CountingSection
        progress={progress}
        baseline={baseline}
        updateStudySettings={updateStudySettings}
        onRecompute={onRecompute}
      />

      {/* AI tutor provider */}
      <section className="rounded-2xl border border-ink/10 bg-white/50 p-5">
        <h3 className="mb-1 font-display text-base font-bold text-ink">AI 老師 · Tutor</h3>
        <p className="mb-4 font-sans text-xs text-ink/50">
          Powers the on-card tutor. Keys are stored only in this browser and sent directly to the
          provider you choose.
        </p>

        <div className="mb-4 grid grid-cols-2 gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.key}
              onClick={() => updateSettings({ aiProvider: p.key })}
              className={`rounded-xl border px-3 py-2.5 text-sm transition ${
                settings.aiProvider === p.key
                  ? 'border-cinnabar bg-cinnabar/5 text-ink'
                  : 'border-ink/15 text-ink/60'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {settings.aiProvider === 'deepseek' ? (
          <div className="flex flex-col gap-4">
            <Field label="DeepSeek API key" hint="stored only in this browser">
              <input
                type="password"
                className={inputCls}
                value={settings.deepseekApiKey}
                onChange={(e) => updateSettings({ deepseekApiKey: e.target.value })}
                placeholder="sk-…"
              />
            </Field>
            <Field label="Model" hint="deepseek-chat, deepseek-reasoner, or v4 ids">
              <input
                className={inputCls}
                value={settings.deepseekModel}
                onChange={(e) => updateSettings({ deepseekModel: e.target.value })}
                placeholder="deepseek-chat"
              />
            </Field>
            <p className="rounded-lg bg-gold/10 px-3 py-2 font-mono text-[11px] leading-relaxed text-ink/60">
              ⚠ DeepSeek advises against direct browser calls. If you see a CORS/network error,
              the request was blocked by the browser — route it through a proxy (see README) or use
              Claude here instead.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Field label="Anthropic API key" hint="stored only in this browser">
              <input
                type="password"
                className={inputCls}
                value={settings.claudeApiKey}
                onChange={(e) => updateSettings({ claudeApiKey: e.target.value })}
                placeholder="sk-ant-…"
              />
            </Field>
            <Field label="Model">
              <input
                className={inputCls}
                value={settings.claudeModel}
                onChange={(e) => updateSettings({ claudeModel: e.target.value })}
                placeholder="claude-sonnet-4-20250514"
              />
            </Field>
          </div>
        )}
      </section>

      {/* Vocabulary */}
      <section className="rounded-2xl border border-ink/10 bg-white/50 p-5">
        <h3 className="mb-1 font-display text-base font-bold text-ink">詞庫 · Vocabulary</h3>
        <p className="mb-3 font-sans text-xs text-ink/50">
          {vocabCount} words loaded. Drop <span className="font-mono">.json</span> packs into a{' '}
          <span className="font-mono">vocab/</span> folder via the 檔案 / Files tab — they load
          automatically.
        </p>
        {vocabInfo?.packs?.length > 0 && (
          <ul className="mb-3 flex flex-col gap-1">
            {vocabInfo.packs.map((p) => (
              <li key={p.name} className="font-mono text-[11px] text-ink/55">
                {p.name} — {p.added} added ({p.count} in pack)
              </li>
            ))}
          </ul>
        )}
        {vocabInfo?.errors?.length > 0 &&
          vocabInfo.errors.map((err, i) => (
            <p key={i} className="mb-1 rounded-lg bg-cinnabar/10 px-3 py-2 font-mono text-[11px] text-seal">
              {err}
            </p>
          ))}
        <button
          onClick={onReloadVocab}
          className="rounded-full border border-ink/20 px-4 py-1.5 font-sans text-sm text-ink/70 hover:border-jade hover:text-jade"
        >
          Reload vocab packs
        </button>
      </section>

      {/* Mic diagnostics */}
      <MicTest />

      {/* Band selection */}
      <section className="rounded-2xl border border-ink/10 bg-white/50 p-5">
        <h3 className="mb-3 font-display text-base font-bold text-ink">學習等級 · Study levels</h3>
        <div className="flex flex-col gap-2">
          {BANDS.map((band) => {
            const on = settings.enabledBands.includes(band)
            return (
              <button
                key={band}
                onClick={() => toggleBand(band)}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 transition ${
                  on ? 'border-cinnabar bg-cinnabar/5' : 'border-ink/10'
                }`}
              >
                <span className="font-sans text-sm text-ink/80">
                  {BAND_LABELS[band]} <span className="font-mono text-xs text-ink/40">{band}</span>
                </span>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                    on ? 'bg-cinnabar text-paper' : 'border border-ink/20 text-transparent'
                  }`}
                >
                  ✓
                </span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}


function stamp(withSeconds) {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const ymd = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
  return withSeconds
    ? `${ymd}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
    : `${ymd}-${p(d.getHours())}${p(d.getMinutes())}`
}

// 資料 · Data: download the in-memory progress, or restore it from a file (DESIGN §15.3).
const CHAPTERS = (() => {
  const m = {}
  for (const r of CCC_VOCAB) {
    if (r.book == null || r.chapter == null) continue
    ;(m[r.book] ||= new Set()).add(r.chapter)
  }
  return Object.fromEntries(Object.entries(m).map(([b, set]) => [b, [...set].sort((x, y) => x - y)]))
})()
const BOOKS = Object.keys(CHAPTERS).map(Number).sort((a, b) => a - b)

function ChapterPicker({ value, onChange }) {
  const chapters = CHAPTERS[value.book] ?? []
  return (
    <div className="flex gap-2">
      <select
        className={inputCls}
        value={value.book}
        onChange={(e) => {
          const book = Number(e.target.value)
          const cs = CHAPTERS[book] ?? []
          onChange({ book, chapter: cs.includes(value.chapter) ? value.chapter : cs[cs.length - 1] })
        }}
      >
        {BOOKS.map((b) => <option key={b} value={b}>Book {b}</option>)}
      </select>
      <select className={inputCls} value={value.chapter} onChange={(e) => onChange({ ...value, chapter: Number(e.target.value) })}>
        {chapters.map((c) => <option key={c} value={c}>Ch {c}</option>)}
      </select>
    </div>
  )
}

const chapterCmp = (a, b) => (a.book - b.book) || (a.chapter - b.chapter)

// DESIGN §5.4 / §8: counting settings (synced in progress.studySettings).
function CountingSection({ progress, baseline, updateStudySettings, onRecompute }) {
  const s = countingSettings(progress.studySettings)
  const [note, setNote] = useState('')
  const snapCount = (progress.snapshots ?? []).length
  const setBaseline = (patch) => {
    const next = { ...s.baseline, ...patch }
    if (chapterCmp(next.studiedThrough, next.solidThrough) < 0) {
      setNote('"Studied through" must be at or after "Solid through".')
      return
    }
    setNote('')
    updateStudySettings({ baseline: next })
  }
  const fmt = (n) => n.toLocaleString('en-US')

  function recompute() {
    if (!window.confirm(`Rewrite ${snapCount} past snapshots with the current settings?`)) return
    const n = onRecompute()
    setNote(`Recomputed ${n} snapshot${n === 1 ? '' : 's'}.`)
  }

  return (
    <section className="rounded-2xl border border-ink/10 bg-white/50 p-5">
      <h3 className="mb-1 font-display text-base font-bold text-ink">計算 · Counting</h3>
      <p className="mb-4 font-sans text-xs text-ink/50">
        How Seen and Known are counted. Changes update today's numbers at once; past days only change when you press Recompute history.
      </p>
      <div className="flex flex-col gap-4">
        <Field label="Known threshold" hint="One Good on a new card = 3.17 days">
          <div className="flex items-center gap-2">
            <select
              className={inputCls}
              value={s.knownThreshold}
              onChange={(e) => updateStudySettings({ knownThreshold: Number(e.target.value) })}
            >
              {THRESHOLD_EDGES.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <span className="font-mono text-sm text-ink/60">days</span>
          </div>
        </Field>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={s.knownRequiresReviewState}
            onChange={(e) => updateStudySettings({ knownRequiresReviewState: e.target.checked })}
          />
          <span>
            <span className="font-sans text-sm font-medium text-ink/80">Known also requires graduation (Review state)</span>
            <span className="mt-0.5 block font-mono text-[11px] text-ink/45">
              A new word must be recalled again later (or rated Easy) before it counts. One lucky Good isn't enough.
            </span>
          </span>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={s.baseline.enabled}
            onChange={(e) => setBaseline({ enabled: e.target.checked })}
          />
          <span className="font-sans text-sm font-medium text-ink/80">Baseline from my course position</span>
        </label>
        <Field label="Solid through" hint="counts as Known until you rate it">
          <ChapterPicker value={s.baseline.solidThrough} onChange={(v) => setBaseline({ solidThrough: v })} />
        </Field>
        <Field label="Studied through" hint="counts as Seen until reviewed">
          <ChapterPicker value={s.baseline.studiedThrough} onChange={(v) => setBaseline({ studiedThrough: v })} />
        </Field>
        <p className="font-mono text-[11px] text-ink/55">
          Solid baseline = {fmt(baseline.solid.size)} words (count as Known) · Studied = {fmt(baseline.studied.size)} words (count as Seen until reviewed)
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={recompute}
            className="rounded-full border border-ink/20 px-4 py-1.5 font-sans text-sm text-ink/70 hover:border-cinnabar hover:text-cinnabar"
          >
            Recompute history
          </button>
          {note && <span className="font-mono text-xs text-ink/60">{note}</span>}
        </div>
      </div>
    </section>
  )
}

function DataSection({ progress, replaceProgress, forcePush, effectiveGh }) {
  const [pending, setPending] = useState(null) // { data, fileName }
  const [confirmText, setConfirmText] = useState('')
  const [status, setStatus] = useState({ kind: 'idle', message: '' })
  const hasToken = Boolean(effectiveGh.token)

  function download() {
    const blob = new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `progress-${DATA_MODE}-${stamp(false)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function pickFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    setConfirmText('')
    setPending(null)
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      if (!data || typeof data.cards !== 'object' || Array.isArray(data.cards) || data.cards === null) {
        throw new Error('This file has no "cards" object, so it is not a progress file.')
      }
      setPending({ data, fileName: file.name })
      setStatus({ kind: 'idle', message: '' })
    } catch (err) {
      setStatus({ kind: 'error', message: `Can't read ${file.name}: ${err.message}` })
    }
  }

  async function restore() {
    if (!pending || confirmText !== 'RESTORE') return
    setStatus({ kind: 'working', message: 'Backing up the current file…' })
    try {
      if (hasToken) {
        const remote = await fetchProgress(effectiveGh)
        if (remote.data) {
          const path = dataPath(`backups/progress-pre-restore-${stamp(true)}.json`)
          await putTextFile(
            effectiveGh,
            path,
            JSON.stringify(remote.data, null, 2),
            undefined,
            `backup before restore: ${path}`
          )
        }
      }
    } catch (err) {
      setStatus({ kind: 'error', message: `Backup failed, nothing restored: ${err.message}` })
      return
    }
    const restored = replaceProgress(pending.data)
    if (!restored) {
      setStatus({ kind: 'error', message: 'This file is from a newer app version. Reload the app.' })
      return
    }
    if (hasToken) forcePush(restored)
    setStatus({ kind: 'ok', message: `Restored from ${pending.fileName}.` })
    setPending(null)
    setConfirmText('')
  }

  const cards = pending ? Object.values(pending.data.cards) : []
  return (
    <section className="rounded-2xl border border-ink/10 bg-white/50 p-5">
      <h3 className="mb-1 font-display text-base font-bold text-ink">資料 · Data</h3>
      <p className="mb-4 font-mono text-xs text-ink/45">
        mode: <span className="text-ink/70">{DATA_MODE}</span> · {effectiveGh.owner}/{effectiveGh.repo}:
        {effectiveGh.path}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={download}
          className="rounded-full border border-ink/20 px-4 py-1.5 font-sans text-sm text-ink/70 hover:border-jade hover:text-jade"
        >
          Download progress.json
        </button>
        <label className="cursor-pointer rounded-full border border-ink/20 px-4 py-1.5 font-sans text-sm text-ink/70 hover:border-cinnabar hover:text-cinnabar">
          Restore from file…
          <input type="file" accept=".json,application/json" className="hidden" onChange={pickFile} />
        </label>
      </div>

      {pending && (
        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-cinnabar/30 bg-cinnabar/5 p-3 font-mono text-xs text-ink/70">
          <p>
            {pending.fileName}: {cards.length} cards · {cards.filter((c) => c?.reps > 0).length} reviewed ·
            log {Array.isArray(pending.data.log) ? pending.data.log.length : 0} · updated{' '}
            {pending.data.updatedAt || '—'}
          </p>
          <p>This replaces your current progress. Type RESTORE to confirm.</p>
          <input
            className={inputCls}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="RESTORE"
          />
          <div className="flex gap-2">
            <button
              disabled={confirmText !== 'RESTORE' || status.kind === 'working'}
              onClick={restore}
              className="rounded-full bg-cinnabar px-4 py-1.5 font-sans text-sm text-paper disabled:opacity-40"
            >
              Restore
            </button>
            <button
              onClick={() => setPending(null)}
              className="rounded-full border border-ink/20 px-4 py-1.5 font-sans text-sm text-ink/70"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {status.message && (
        <p
          className="mt-3 font-mono text-xs"
          style={{ color: status.kind === 'ok' ? '#2d6a4f' : status.kind === 'error' ? '#c0392b' : '#b8860b' }}
        >
          {status.message}
        </p>
      )}
    </section>
  )
}
