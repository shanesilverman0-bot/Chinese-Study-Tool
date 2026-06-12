import React, { useState } from 'react'
import { BANDS, BAND_LABELS } from '../data/vocab.js'
import { verifyAccess } from '../lib/github.js'
import { PROVIDERS } from '../lib/tutor.js'
import MicTest from './MicTest.jsx'
import DangdaiFilter from './DangdaiFilter.jsx'


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
  vocabInfo,
  vocabCount,
  onReloadVocab,
  vocab,
  dangdaiFilter,
  setDangdaiFilter,
}) {
  const [verify, setVerify] = useState({ status: 'idle', message: '' })

  const gh = settings.github

  function setGh(patch) {
    updateSettings({ github: { ...gh, ...patch } })
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
      const res = await verifyAccess(gh)
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
        <h3 className="mb-1 font-display text-base font-bold text-ink">GitHub 同步 · Sync</h3>
        <p className="mb-4 font-sans text-xs text-ink/50">
          Progress is committed as <span className="font-mono">progress.json</span> in your repo,
          so the same app syncs across all devices. Token needs <span className="font-mono">repo</span>{' '}
          scope (or fine-grained <span className="font-mono">contents: read/write</span>).
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
                value={gh.owner}
                onChange={(e) => setGh({ owner: e.target.value })}
                placeholder="your-username"
              />
            </Field>
            <Field label="Repo">
              <input
                className={inputCls}
                value={gh.repo}
                onChange={(e) => setGh({ repo: e.target.value })}
                placeholder="tocfl-tutor"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Branch">
              <input
                className={inputCls}
                value={gh.branch}
                onChange={(e) => setGh({ branch: e.target.value })}
                placeholder="main"
              />
            </Field>
            <Field label="File path">
              <input
                className={inputCls}
                value={gh.path}
                onChange={(e) => setGh({ path: e.target.value })}
                placeholder="progress.json"
              />
            </Field>
          </div>

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
              onClick={forcePush}
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

      {/* CCCC study filter */}
      <section className="rounded-2xl border border-ink/10 bg-white/50 p-5">
        <h3 className="mb-3 font-display text-base font-bold text-ink">當代中文 · Chapter Filter</h3>
        <p className="mb-3 font-sans text-xs text-ink/50">
          Filter study sessions to a specific book, lesson, or vocabulary set.
        </p>
        <DangdaiFilter
          vocab={vocab}
          filter={dangdaiFilter}
          onChange={setDangdaiFilter}
          progress={progress}
        />
      </section>

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
