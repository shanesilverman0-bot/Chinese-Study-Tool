# CLAUDE.md — 習字 / TOCFL Tutor v2

Read `docs/DESIGN.md` and the one phase you were given in `docs/PHASES.md`. Implement only that phase.

## Hard rules
- Work only on branch `v2-update`. Never commit to, push to, or merge into `main`. Never merge anything. Shane merges after testing on his phone.
- Run `git rev-parse --show-toplevel` first. It must print this repo's folder. If it prints `/Users/shanesilverman`, STOP: you are in the home-directory repo, not the project clone (see `docs/WORKFLOW.md`, one-time setup).
- Study data lives in the **private** data repo `Chinese-Study-Data` (DESIGN §3). The app never writes to this (public) app repo. Dev builds write only under `dev/` in the data repo; nothing on `v2-update` may write the live `progress.json`. Never weaken the write guard in `src/lib/dataMode.js`. Never put study data, grammar lists or personal files in this public repo.
- Until Phase 0 is merged into your branch, `npm run build` DELETES `docs/` (Vite `outDir: 'docs'`, `emptyOutDir: true`). Phase 0 fixes this first. Do not run a build before that change.
- Validation = `npm run build` + the GitHub Actions CI run on `v2-update`. There is no test suite; do not add one. Phases may add small Node check scripts under `scripts/` when the phase says so.
- `progress.json` data must keep working. Schema changes need a `schemaVersion` bump and an idempotent migration in `src/lib/migrate.js` that never deletes data. Sole approved exception: empty stub cards (`isStub`, DESIGN §6.1), removed only after the pre-v3 backup.
- No hard caps on what you study: session size is chosen in the picker. Never silently truncate data (the review log is archived, not capped).
- Traditional Chinese only, Taiwan usage, tone-marked pinyin (never tone numbers in the UI).
- Mobile-first: iPhone, Chrome (WebKit). Check layouts at 375px wide.
- Do not make design decisions the phase spec doesn't cover. If the spec is ambiguous, pick the most conservative option, write it in the commit message, and add a line to `docs/RISKS.md` under "Implementation notes".

## End of every phase
```bash
npm run build
git add -A
git commit -m "Phase N: <summary>"
git push origin v2-update
```
Then confirm the "CI" workflow run for that commit is green (GitHub → Actions).
