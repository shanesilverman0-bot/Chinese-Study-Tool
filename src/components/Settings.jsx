import React, { useState } from 'react'
import { BANDS, BAND_LABELS } from '../data/vocab.js'
import { verifyAccess } from '../lib/github.js'

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

export default function Settings({ settings, updateSettings, syncState, pull, forcePush }) {
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

      {/* Claude API */}
      <section className="rounded-2xl border border-ink/10 bg-white/50 p-5">
        <h3 className="mb-1 font-display text-base font-bold text-ink">Claude AI 老師 · Tutor</h3>
        <p className="mb-4 font-sans text-xs text-ink/50">
          Powers the on-card tutor. Key is stored only in this browser and sent directly to
          Anthropic.
        </p>
        <Field label="Anthropic API key">
          <input
            type="password"
            className={inputCls}
            value={settings.claudeApiKey}
            onChange={(e) => updateSettings({ claudeApiKey: e.target.value })}
            placeholder="sk-ant-…"
          />
        </Field>
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
