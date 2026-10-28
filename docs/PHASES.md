# PHASES — 習字 / TOCFL Tutor v2

One phase per Claude Code session. Do them in order unless "Depends on" says otherwise. Each phase is small enough for one Sonnet session without a context reset.
Read `docs/DESIGN.md` first. Section references like §8.2 point there. **Revised 2026-10-29** for Shane's answers: data now lives in a private data repo (Phase 1A), stubs are pruned (1B), and Phases 4, 5, 6, 8, 14 and 15 changed.

## Conventions for every phase

- **Branch:** `v2-update` only. First command of every session: `git rev-parse --show-toplevel && git branch --show-current`. It must print the project clone and `v2-update`.
- **Schema:** after Phase 1B, every phase uses the v3 fields that DESIGN §5 already defines. If a phase needs a field that isn't in §5, stop and ask. Do not invent schema.
- **Check scripts:** `scripts/*.mjs` are plain Node scripts run by hand. They are not a test suite. They read real data from `local-data/progress.copy.json` (gitignored), never from the repo-root `progress.json`. To refresh that copy: before the cutover (first merge), `git fetch origin && git show origin/main:progress.json > local-data/progress.copy.json`; after it, `git -C ~/Desktop/Chinese-Study-Data pull && cp ~/Desktop/Chinese-Study-Data/progress.json local-data/progress.copy.json`.
- **Acceptance checks** say what you should see. "Console" means the desktop Chrome DevTools console on the Mac with `npm run dev` open (dev mode exposes `window.__tt`). "Phone" means the iPhone over `npm run dev:phone` (WORKFLOW §4).
- **Git sequence (every phase):**
  ```bash
  npm run build
  git status                      # only files named in the phase should be listed
  git add -A
  git commit -m "Phase N: <one-line summary>"
  git push origin v2-update
  ```
  Then GitHub → Actions → the "CI" run for this commit must be green. If it's red, open the log, fix, then commit and push again.

## Phase overview

| # | Phase | Depends on | Opus review? | Model |
|---|---|---|---|---|
| 0 | Repo and build safety | — | No | Sonnet |
| 1A | Private data repo, dev data mode, write guard, download/restore | 0 | **Yes** | Sonnet |
| 1B | Schema v3, item keys, migration (prunes stubs), pre-v3 backup | 1A | **Yes** | Sonnet |
| 2 | Merge-on-save sync, compact JSON | 1B | **Yes** | Sonnet, Opus review is mandatory |
| 3 | Item registry, bundled CCC, TOCFL matching, baseline set | 1B | **Yes** | Sonnet |
| 4 | Counts engine (two-tier baseline), daily snapshots, counting settings | 3 | **Yes** | Sonnet |
| 5 | Dashboard: chart, goals, exam-date selector, pace box | 4 | No | Sonnet |
| 6 | Review-log archive, FSRS backfill, course-history estimate | 4, 2 | **Yes** | Sonnet; Opus if the replay check fails |
| 7 | Session timer, manual entries, hours chart | 1B (5 for placement) | No | Sonnet |
| 8 | Lists (incl. CCC parts), multi-select picker, queue rewrite (no cap, learning re-show) | 3, 4 | **Yes** | Sonnet |
| 9 | Pleco XML import | 8 | No | Sonnet |
| 10 | Natural OS voices | 0 | No | Sonnet |
| 11 | Exercise input export, validator, import, storage | 8 | No | Sonnet |
| 12 | Exercise player and practice mode, attempt log | 11, 10 | No | Sonnet |
| 13 | List tests with variants, test history, attempt rollup | 12, 2 | **Yes** | Sonnet |
| 14 | Context rule, understanding score, gap list, verify-file import | 13, 4 | **Yes** | Sonnet |
| 15 | Sentence writing and grading (counts toward Context) | 1B, 8 (14 for the Context link) | No | Sonnet |
| 16 | Tone trainer fix | 0 | No | Sonnet (needs phone testing) |

Phase 6 should land within about a month of going live: until the log archive exists, `progress.log` grows without a cap (about 110 bytes per rating, harmless for months, but the archive keeps the file small).

Phases 7, 10, 15 and 16 are independent of each other. They can be moved earlier if you want them sooner (F1 timer is your top-ranked item, so 7 can run right after 1B).

**How to do an Opus review:** after the phase is pushed, start a fresh session with the Opus model and paste:
> Read docs/DESIGN.md and Phase N in docs/PHASES.md. Review the diff of the last commit (`git show HEAD`) for data-loss and counting bugs only. Run the phase's check scripts against local-data/progress.copy.json. Report problems as a list; fix only clear bugs, then build, commit "Phase N review fixes", and push to v2-update.

---

## Phase 0 — Repo and build safety

**Session prompt:**
> Read CLAUDE.md, docs/DESIGN.md §2 and §10.5, and Phase 0 in docs/PHASES.md. Implement only Phase 0. Do NOT run `npm run build` until the vite.config.js change is made. Then run npm install and npm run build and fix errors. Commit and push to v2-update, then tell me to check the CI run on GitHub Actions.

- **Depends on:** WORKFLOW §1 one-time setup done (fresh clone on `v2-update`, docs copied in).
- **Review with Opus?** No. No app behavior or data changes.
- **Model:** Sonnet.

**Why first:** `vite build` currently writes to `docs/` with `emptyOutDir: true`. One build deletes every design doc. Also, no workflow runs on `v2-update`, so "confirm GitHub Actions passes" is impossible until CI exists.

**Files**
- `vite.config.js`: `build.outDir: 'dist'` (keep `emptyOutDir: true`, `base: './'`). Update the comment.
- `.github/workflows/deploy.yml`: `path: dist` in `upload-pages-artifact`. Change `npm install` to `npm ci`. Add under `on.push`:
  ```yaml
  paths-ignore:
    - 'progress.json'
    - 'progress.dev.json'
    - 'exercises/**'
    - 'backups/**'
    - 'docs/**'
    - '**/*.md'
  ```
  (`workflow_dispatch` stays, so you can still deploy by hand.)
- `.github/workflows/ci.yml` (new): name `CI`. Runs on `push` to `v2-update` and on `workflow_dispatch`. Steps: checkout v4.2.2, setup-node v4.4.0 with node 20 and `cache: npm`, `npm ci`, `npm run build`. It deploys nothing.
- `.gitignore`: add `local-data/` and `.env*.local`. `dist` is already listed.
- Remove the built files from git: `git rm -r --cached docs/assets docs/index.html`, then delete them from disk.
- Move the Pleco sample: if `docs/11月PLECO字.xml` exists, `git mv` it to `docs/samples/pleco-sample.xml` (if the samples file already exists with the same content, just `git rm` the old one).
- `README.md`: in the deploy section, change "build to docs/" wording to `dist/`. Add one line: "Design docs live in docs/; the build goes to dist/."
- Move the stray converter script: `git mv "Desktop/Taiwan Documents/美語工作/China Study App/scripts/convert-dangdai.mjs" scripts/convert-dangdai.mjs` (create `scripts/`), and remove the now-empty `Desktop/` tree from git if anything else is tracked under it (list it first with `git ls-files Desktop`; if it contains anything other than that one script, stop and ask).

**Behavior:** none in the app.

**Edge cases**
- Pages settings must be "Source: GitHub Actions" (README says so). If it were "Deploy from branch /docs", removing `docs/index.html` would break the live site after merge. Before merging, check GitHub → Settings → Pages (WORKFLOW §8 step 1).
- `npm ci` needs `package-lock.json` in sync with `package.json`. If `npm ci` fails locally, run `npm install` once and commit the updated lock file.

**Acceptance checks**
1. `npm run build` prints `dist/index.html` and `dist/assets/…`. `ls docs` still shows `DESIGN.md PHASES.md RISKS.md WORKFLOW.md SPEC.md prompts samples`.
2. `git status` after the build shows no `dist/` files.
3. GitHub → Actions: a run named **CI** for branch `v2-update` is green. No "Deploy to GitHub Pages" run was triggered by this push.
4. `npm run dev` still opens the app at http://localhost:5173 and it looks unchanged.

**Migration:** none.

---

## Phase 1A — Private data repo, dev data mode, write guard, download/restore

**Session prompt:**
> Read CLAUDE.md, docs/DESIGN.md §3 and §15, and Phase 1A in docs/PHASES.md. Implement only Phase 1A. Run npm run build and fix errors. Commit and push to v2-update.

- **Depends on:** 0. The private data repo must exist with `dev/progress.json` in it (WORKFLOW §1 step 5). If you can't confirm it, stop and tell me.
- **Review with Opus?** **Yes.** This guard is what keeps dev builds away from live data, and the app away from the public repo.
- **Model:** Sonnet.

**Files**
- `.env.development`: `VITE_DATA_MODE=dev`
- `.env.production`: `VITE_DATA_MODE=live`
- `.env.offline`: `VITE_DATA_MODE=local`
- `.env.phone`: `VITE_DATA_MODE=dev`
- `package.json` scripts: add `"dev:phone": "vite --host --mode phone"` and `"dev:offline": "vite --mode offline"`. devDependency `@vitejs/plugin-basic-ssl` pinned to `1.1.0`.
- `vite.config.js`: function form `defineConfig(({ mode }) => ({ … plugins: [react(), ...(mode === 'phone' ? [basicSsl()] : [])] … }))`.
- `src/lib/dataMode.js` (new):
  - `export function computeMode(envMode, hostname)`: returns `'live'` only if `envMode === 'live' && hostname.endsWith('.github.io')`. `'local'` if `envMode === 'local'`. Otherwise `'dev'`.
  - `export const DATA_MODE = computeMode(import.meta.env.VITE_DATA_MODE, location.hostname)`
  - `export const APP_REPO = 'shanesilverman0-bot/Chinese-Study-Tool'`, `export const DEFAULT_DATA_REPO = { owner: 'shanesilverman0-bot', repo: 'Chinese-Study-Data', branch: 'main' }`
  - `export function dataPath(rel)`: live → `rel`; dev → `dev/${rel}`; local → `rel` (never used for network).
  - `export function storageKey(name)`: `live` → `tocfl.${name}`, else `tocfl.${DATA_MODE}.${name}`.
  - `export function effectiveGithub(settings)`: returns `{ token, owner, repo, branch: 'main', path: dataPath('progress.json') }` built from `settings.data` (falling back to `DEFAULT_DATA_REPO`) and `settings.github.token`. In local mode the token is `''`, so `githubReady` is false. The old `settings.github.repo/branch/path` are ignored.
  - `export function assertWriteAllowed({ owner, repo, path })`: exactly the rules in DESIGN §3.2 (compare against the effective data repo). Throws `Error('Blocked write: <mode> mode cannot write <owner>/<repo>:<path>')`.
- `src/lib/github.js`: call `assertWriteAllowed({ owner, repo, path })` as the first line of `saveProgress`, `putTextFile`, `uploadFile`, `createFolder` (path = the `.gitkeep` path), and `deleteFile`. In `saveProgress`, a 404 on the repo → `Error('Data repo <owner>/<repo> not found, or the token has no access to it. See WORKFLOW §1 step 5.')`.
- `src/hooks/useProgress.js`: replace `SETTINGS_KEY`/`LOCAL_PROGRESS_KEY` with `storageKey('settings')`/`storageKey('progress')`. Every call to `fetchProgress`/`saveProgress` uses `effectiveGithub(settings)`. `githubReady` is computed from the effective config. Settings gain `data: { owner, repo }` (default `DEFAULT_DATA_REPO`).
- `src/hooks/useStudyFilter.js`: `FILTER_KEY` → `storageKey('studyFilter')`.
- `src/App.jsx`: runtime vocab packs and `RepoFiles` (the 檔案 tab) use the effective data-repo config (`vocab/` folder of the data repo). Render `<DataBanner />` above the header. When `DATA_MODE !== 'live'`, set `window.__tt = { dataMode: DATA_MODE, assertWriteAllowed, dataPath, get progress() { … } }` (use a ref so the getter returns current state).
- `src/components/DataBanner.jsx` (new): nothing in live. Amber bar (`bg-amber-500 text-ink text-xs font-mono text-center py-1`) with `DEV DATA · <repo>/dev/progress.json`, or a grey bar with `LOCAL ONLY · not synced`.
- `src/components/Settings.jsx`:
  - The GitHub section becomes **資料庫 · Data repo**: token, owner, repo (defaults filled in), a read-only line "File: `<path>`" from `effectiveGithub`, and the hint "Use a fine-grained token with access only to this private repo (Contents: read and write)". The old branch/path inputs are removed from the UI.
  - New section **資料 · Data**: shows mode and effective `owner/repo:path`. Button **Download progress.json** (Blob of `JSON.stringify(progress, null, 2)`, filename `progress-<mode>-<YYYYMMDD-HHmm>.json`). Button **Restore from file…** (hidden `<input type=file accept=".json,application/json">`): parse; reject unless `cards` is an object; show cards count, reviewed (`reps>0`) count, `log.length`, `updatedAt`; text input where you must type `RESTORE`; then (1) write a backup of the current remote file to `dataPath('backups/progress-pre-restore-<YYYYMMDD-HHmmss>.json')` via `putTextFile`, (2) `setProgress(reconcile(data, vocab))`, (3) `forcePush`. If the backup write fails, abort and show the error.
- `useProgress` returns a new `replaceProgress(data)` used by Restore.

**Edge cases**
- `npm run preview` on localhost serves the production build, so `envMode` is `live`, but the hostname isn't github.io. The banner must say DEV.
- A token entered on the dev origin is separate from the live one (different origin). That's expected.
- On a first dev run with no token: the banner shows, nothing syncs, no errors in the console.
- Until the cutover, the **live** site still runs the old code from `main` and writes the app repo. Nothing in this phase changes that.

**Acceptance checks**
1. `npm run dev` → amber DEV banner. Settings → Data repo shows `shanesilverman0-bot / Chinese-Study-Data`, File `dev/progress.json`.
2. Console: `__tt.dataMode` → `"dev"`. `__tt.assertWriteAllowed({owner:'shanesilverman0-bot', repo:'Chinese-Study-Data', path:'progress.json'})` → throws. `__tt.assertWriteAllowed({owner:'shanesilverman0-bot', repo:'Chinese-Study-Tool', path:'dev/progress.json'})` → throws. `__tt.dataPath('backups/x.json')` → `"dev/backups/x.json"`.
3. With the token set, rate one card. Within ~10 s, GitHub → Chinese-Study-Data shows a new commit that changed only `dev/progress.json`. The app repo has no new commit.
4. `npm run build && npm run preview`, open http://localhost:4173 → DEV banner (not live).
5. `npm run dev:offline` → grey LOCAL ONLY banner. Rating works, the sync dot is hidden, no network calls to api.github.com (DevTools → Network).
6. Download produces a file that opens as JSON with a `cards` object.
7. Restore with the downloaded file: typing anything other than `RESTORE` keeps the button disabled. After restore, the data repo contains `dev/backups/progress-pre-restore-…json`.
8. DevTools → Application → Local Storage on the dev origin shows `tocfl.dev.settings`, not `tocfl.settings`.

**Migration:** none (no schema change).

---

## Phase 1B — Schema v3, generic item keys, migration (prunes stubs), pre-v3 backup

**Session prompt:**
> Read CLAUDE.md, docs/DESIGN.md §4.1, §5, §6, and Phase 1B in docs/PHASES.md. Implement only Phase 1B. Run the migration check script against local-data/progress.copy.json as described, then npm run build and fix errors. Commit and push to v2-update.

- **Depends on:** 1A.
- **Review with Opus?** **Yes.** It rewrites the shape of your only copy of progress and removes ~9,100 empty cards.
- **Model:** Sonnet.

**Files**
- `src/lib/schema.js` (new, pure, no imports from React/Vite): `CURRENT_SCHEMA = 3`, `THRESHOLD_EDGES`, `DEFAULT_STUDY_SETTINGS` (DESIGN §5.4 with `updatedAt: '1970-01-01T00:00:00.000Z'`), `DEFAULT_GOALS` (§5.5 with the same epoch `updatedAt`), `emptyCollections()`, `freshV3(cards = {})`.
- `src/lib/ids.js` (new): `newId(prefix)` → `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`.
- `src/lib/dates.js` (new): `localDate(date, tz)` using `Intl.DateTimeFormat('en-CA', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit' })`. `addDays(ymd, n)`. `weekStartMonday(ymd)`. `daysBetween(a, b)`.
- `src/lib/items.js` (new, minimal here): `GRAMMAR_PREFIX = 'g:'`, `itemTypeOf(key)`, `isWordKey(key)`.
- `src/lib/migrate.js` (new): `migrate(p, { now, device })` and `isStub(card, key, loggedKeys)` exactly as DESIGN §6.1. Also `export function needsPreV3Backup(remoteRaw)` → true when the parsed remote has no `schemaVersion` or one below 3.
- **No more stubs:** `reconcile()` in `useProgress.js` stops creating a card for every vocab word (DESIGN §6.1). `freshProgress` starts with `cards: {}`. Every place that reads `progress.cards[key]` must handle a missing card as "new": `App.jsx` `buildQueue` (unseen = no card or `reps === 0`), `Dashboard.jsx` mastery panels, `Flashcard.jsx` interval preview (`newCardState(word)` when undefined). `rate()` creates the card with `newCardState(item)` when none exists.
- `src/lib/fsrs.js`: `cardKey` unchanged. No other change.
- `src/hooks/useProgress.js`:
  - `freshProgress()` returns `freshV3({})`.
  - Every load path (localStorage, `pull`, `replaceProgress`) runs `migrate()` and then `reconcile()`. Wrap it: if `migrate` throws (newer schema), set `syncState` to error with the message, set `blockedRef.current = true`, and keep the local state. `push` returns early while blocked.
  - `rate()`: if the card had `reps === 0` before this rating, set `firstSeen = now ISO` on the updated card. `reviewCard()` drops unknown fields, so copy `firstSeen` over explicitly: `{ ...updated, firstSeen: card.firstSeen ?? (card.reps === 0 ? nowIso : null) }`.
  - Pre-v3 backup: before the **first** push of the session, fetch the remote (existing `fetchProgress`). If `needsPreV3Backup(remote)`, write the raw remote JSON (`JSON.stringify(remote.data, null, 2)`) to `dataPath('backups/progress-pre-v3-<YYYYMMDD-HHmmss>.json')` via `putTextFile`. On success, set `progress.migrations[last].backupPath` to that path, then save. On failure, show "Backup failed — not saving" in `syncState`, do not save, and retry on the next scheduled push. Track this with `backupCheckedRef`.
  - Restore (from 1A) now runs `migrate()` before `reconcile()`.
- `src/App.jsx`: add `migrate` and `itemTypeOf` to `window.__tt`.
- `scripts/check-migration.mjs` (new): usage `node scripts/check-migration.mjs <input.json>`. It imports `../src/lib/migrate.js` and prints:
  - input: cards, reviewed, log length, legacy id-keyed cards, top-level keys
  - output: schemaVersion, cards kept, stubs removed, cards with `firstSeen`, collections added, file size before/after (compact JSON)
  - PASS/FAIL for each invariant in DESIGN §6.1 (idempotent; every non-stub card kept with identical fields except `firstSeen`; every removed card is a stub; every `reps > 0` card kept; log length unchanged; all top-level keys kept)
  - It writes `local-data/progress.migrated.json` and exits with code 1 on any FAIL.

**Migration test (do this in the session, and paste the output into the commit message body):**
```bash
mkdir -p local-data
git fetch origin
git show origin/main:progress.json > local-data/progress.copy.json
node scripts/check-migration.mjs local-data/progress.copy.json
```
(`git show` only reads `main`; nothing is written there.) Expected with the 2026-10-27 data: input cards 9409, reviewed 277, log 375, legacy 62. The numbers are higher if you've studied since. Output: schemaVersion 3, cards kept 277, stubs removed 9,132, `firstSeen` set on 277 cards, all invariants PASS.

**Edge cases**
- Cards with `reps > 0` but no log entry and no `last_review` → `firstSeen: null`. The count is printed by the script.
- A localStorage copy that is already v3 and a remote that is v1: both migrate, and the remote backup is still written once.
- The old `version` field must stay exactly as it was (1).
- A card with `reps === 0` but a `last_review` or a log entry (rated, then reset) is **not** a stub and is kept.

**Acceptance checks**
1. The script output shows all PASS, as above.
2. `npm run dev` with a token → after the first rating, the data repo has `dev/backups/progress-pre-v3-<timestamp>.json` and then a progress commit. `dev/progress.json` on GitHub now contains `"schemaVersion": 3`, `"migrations": [ … "backupPath": "dev/backups/…", "removedStubs": 9132 ]`, and `"goals"` with 3 entries. It is far smaller than before (about 0.1–0.2 MB).
3. Reload the page and rate another card: no second backup file is created (remote is already v3).
4. Console: `__tt.progress.schemaVersion` → `3`. `Object.values(__tt.progress.cards).filter(c => c.reps > 0 && !c.firstSeen).length` → `0` or the null count printed by the script.
5. Console: `__tt.migrate({ schemaVersion: 99, cards: {} })` throws "newer app version".
6. The app looks and works as before (flashcards, filters, sync dot green). Unseen words still appear as new cards even though they have no stored card.

---

## Phase 2 — Merge-on-save sync, compact JSON

**Session prompt:**
> Read CLAUDE.md, docs/DESIGN.md §7, and Phase 2 in docs/PHASES.md. Implement only Phase 2. Run scripts/check-merge.mjs against local-data/progress.copy.json, then npm run build and fix errors. Commit and push to v2-update.

- **Depends on:** 1B.
- **Review with Opus?** **Yes, mandatory.** A merge bug silently loses reviews on every device.
- **Model:** Sonnet. If the check script fails twice after fixes, switch the session to Opus.

**Files**
- `src/lib/merge.js` (new, pure): `mergeProgress(local, remote)` implementing the table in DESIGN §7. Both inputs are already migrated. It returns a new object and mutates neither. Helpers: `mergeById(a, b, idField, stampField)`, `mergeMap(a, b, stampField)`, `laterIso(a, b)`.
- `src/lib/github.js`:
  - `saveProgress(cfg, data, sha)`: now **uses** the passed `sha` (no internal refetch). It serializes with `JSON.stringify(data)` (compact). It returns `{ ok: true, sha }` or `{ ok: false, conflict: true }` on 409/422 "does not match". Other errors throw (after the 1A branch-not-found handling).
  - `fetchProgress` unchanged.
- `src/hooks/useProgress.js`:
  - New save flow exactly as DESIGN §7: debounce **4000 ms**; `document.addEventListener('visibilitychange', …)` flushes immediately when `document.visibilityState === 'hidden'`; fetch → migrate → merge → (backup check from 1B) → PUT with sha → on conflict repeat up to 3 times → `setProgress(merged)` (keep any local changes made during the save by merging again: `setProgress(prev => mergeProgress(prev, merged))`).
  - A `savingRef` prevents overlapping saves. A change during a save schedules another save afterwards.
  - `pull()` also merges: `setProgress(prev => mergeProgress(prev, migrate(remote)))` instead of replacing.
  - `forcePush` keeps its "no merge" behavior, used only by Restore (fetch the sha, PUT local as-is).
- `src/App.jsx`: add `mergeProgress` to `window.__tt`.
- `scripts/check-merge.mjs` (new): loads a migrated copy (`local-data/progress.migrated.json`, or runs `migrate` on the given file). It builds device A and device B copies:
  - A: rate card 遺憾|yíhàn (set reps+1, new `last_review` = T1), add snapshot date 2026-11-01, add session sA.
  - B: rate card 完整|wánzhěng (T2), add snapshot 2026-11-01 with a later `computedAt`, add session sB, tombstone goal `goal-jun-2027` with a later `updatedAt`.
  - Asserts: merged has both card updates; both sessions; the later snapshot; the goal tombstoned; `log` contains both new entries once and is **not** truncated (add 6,000 synthetic log entries to A first); `merge(A, A)` deep-equals A; no non-stub card lost; no top-level key lost. Then merge A with a copy of the **pre-migration** file (stubs present, simulating the old app): the result contains no stubs and every reviewed card. It prints PASS/FAIL and exits 1 on any FAIL.

**Edge cases**
- The remote file is missing (first save on a new path) → merge with `freshV3()`.
- A remote with a newer `schemaVersion` → blocked as in 1B (no merge, no save).
- Local state changes while a save is in flight → the next save includes them.
- Two tabs on the same device: harmless, both merge.

**Acceptance checks**
1. `node scripts/check-merge.mjs local-data/progress.copy.json` → all PASS.
2. Two-device test in dev mode: Mac Chrome (`npm run dev`) and the phone (`npm run dev:phone`), both with the token. Rate card X on the Mac and card Y on the phone within 10 s of each other. Wait 15 s, press Settings → Pull on both. Console on the Mac: `__tt.progress.cards['<X>'].reps` and `['<Y>'].reps` both went up. Your phone's review screen also shows Y and X as not due.
3. GitHub → Chinese-Study-Data → `dev/progress.json`: the file is a single line (compact).
4. Locking the phone mid-session (visibility hidden) triggers a save immediately: the sync dot goes amber, then green.

**Migration:** none (no schema change; compact formatting only).

---

## Phase 3 — Item registry, bundled CCC, TOCFL matching, baseline set

**Session prompt:**
> Read CLAUDE.md, docs/DESIGN.md §4 and §8.1–8.2, and Phase 3 in docs/PHASES.md. Implement only Phase 3. Run scripts/check-counts.mjs as described, then npm run build and fix errors. Commit and push to v2-update.

- **Depends on:** 1B.
- **Review with Opus?** **Yes.** Matching decides the baseline, which shifts the Known count by ~1,300–1,900.
- **Model:** Sonnet.

**Files**
- `src/lib/vocab.js`: export `normalizeEntry`. `loadVocabPacksFromGitHub(cfg, { skipNames = [] } = {})` skips files whose name is in `skipNames`.
- `src/data/ccc.js` (new): `const mods = import.meta.glob('../../vocab/cccc-book*.json', { eager: true, import: 'default' })`. `export const CCC_PACK_NAMES` (the 6 file names). `export const CCC_VOCAB` = every pack's `vocab` mapped through `normalizeEntry` with `source: 'cccc'`, deduped per pack by key (same as the runtime loader).
- `src/lib/items.js` (extend; pure, data passed in): `normPinyin(p)`, `buildItemIndex({ tocfl, ccc, customItems = {}, grammar = [] })` → `{ get(key), all(), tocflKeys: Set, byHanzi: Map, match(hanzi, pinyin), aliasesOf(tocflKey) }`. `matchToTocfl` implements the 6 tiers of DESIGN §4.3. Each CCC item gets `tocflKey` (tiers 1–4, else null). Each item also keeps its parts in `ccc: [{book, chapter, part}]`. `firstChapterOf(tocflKey)` = earliest `(book, chapter)` among its CCC aliases. `baselineSets(index, cccEntries, baseline)` → `{ solid: Set, studied: Set }` per DESIGN §8.2 (inclusive `through` bounds; a key belongs to the tier of its first chapter).
- `src/App.jsx`: initial vocab = `[...SEED_VOCAB, ...CCC_VOCAB]`. `reloadVocab` → `setVocab([...SEED_VOCAB, ...CCC_VOCAB, ...res.vocab])` with `skipNames: CCC_PACK_NAMES`. Without a token the vocab stays seed + CCC (no longer seed only). Build `itemIndex` with `useMemo` from `SEED_VOCAB`, `CCC_VOCAB`, `progress.customItems`. Add `items: itemIndex` to `window.__tt`.
- `src/components/Dashboard.jsx`: no logic change. The CCC tab now works without a token.
- `scripts/check-counts.mjs` (new; extended in Phase 4): reads the TOCFL seed by importing `../src/data/vocab.js` (plain ESM), reads `vocab/cccc-book*.json` with `fs`, builds the index with `items.js`, and prints:
  - unique TOCFL keys (expect **7215**), TOCFL rows (7517), duplicate keys (302)
  - match tiers for CCC rows in books 1–3 and for all books (counts per tier)
  - baseline tier sizes for the defaults (solidThrough B3C9, studiedThrough B4C4), plus a per-band breakdown
  - the CCC ↔ TOCFL gap table from `docs/CCC-TOCFL-GAP.md` (per band: total, met through B4C4, met later in CCC, never in CCC)

**Edge cases**
- CCC entries whose pinyin has spaces or capitals (`Wūlóng chá`) → normalized tier.
- TOCFL keys with `/` variants are matched in tier 3.
- `ambiguous`: list them in the script output (expect 2 in books 1–3).
- Bundling adds ~1.3 MB of raw JSON to the JS bundle (~200 KB gzipped). `npm run build` must still succeed. Note the bundle size from the build output in the commit message.

**Acceptance checks**
1. `node scripts/check-counts.mjs local-data/progress.copy.json` prints unique TOCFL keys 7215. Books 1–3 tiers are close to exact 1410, normalized 27, (variant + hanzi-unique) ≈ 84, ambiguous 2, none 551. Baseline tiers ≈ solid 1,268 and studied 325 (architect's measurement, ±20), and the gap table matches `docs/CCC-TOCFL-GAP.md` ±20 per cell. Add the printed numbers to `docs/RISKS.md` under "Implementation notes".
2. `npm run dev:offline` (no token): Home → 當代中文 tab shows Books 1–6 (before, it said "Upload vocab packs").
3. Console: `__tt.items.match('這','zhèi')` → `{status:'hanzi-unique', key:'這|zhè'}`. `__tt.items.match('照片','zhàopiàn')` → status `variant`. `__tt.items.get('在|zài').bands` → `['Novice','B']`.
4. With a token in dev: the Settings vocab info shows no duplicate CCC packs loaded (6 bundled; runtime loads only extra packs from the data repo's `vocab/` folder, if any).

**Migration:** none.

---

## Phase 4 — Counts engine, daily snapshots, counting settings

**Session prompt:**
> Read CLAUDE.md, docs/DESIGN.md §5.4, §5.6, §8, §15.1, and Phase 4 in docs/PHASES.md. Implement only Phase 4. Run scripts/check-counts.mjs, then npm run build and fix errors. Commit and push to v2-update.

- **Depends on:** 3.
- **Review with Opus?** **Yes.** This produces the numbers your whole plan runs on.
- **Model:** Sonnet.

**Files**
- `src/lib/counts.js` (new, pure; baseline per DESIGN §8.2–8.3, two tiers): `effectiveCards(progress, index)` → `Map(tocflKey → {card, firstSeen})` (highest stability among the own card plus alias cards; earliest firstSeen). `isKnownCard(card, settings)`. `computeCounts({ progress, index, settings, baseline })` → `{ seen, known, context, raw }`, with `raw` as in §5.6 and context from an injected `contextQualified` (default `() => false` until Phase 14). `buildSnapshot(date, counts, settings, source)`. `upsertSnapshot(progress, snap)` → new progress (replace same date). `recomputeHistory({ progress, index, settings, baselineFor })` (§8.5; keeps `context`; sets `source:'recomputed'`).
- `src/hooks/useCounts.js` (new): memoizes `computeCounts` over `[progress.cards, progress.studySettings, itemIndex]`. Exposes `{ counts, today }`. Runs `upsertTodaySnapshot` (a) once data is ready: migration done, plus the first pull settled or GitHub not configured; (b) on `visibilitychange → hidden`, at most once per 10 minutes (timestamp in a ref). Exposes `snapshotNow()` for Phase 7. The upsert goes through a new `updateProgress(fn)` from `useProgress` that applies `fn` and schedules a save.
- `src/hooks/useProgress.js`: add `updateProgress(fn)` and `updateStudySettings(patch)` (sets `updatedAt`).
- `src/components/Dashboard.jsx`: new top card "今天 · Today" with three numbers: **Seen**, **Known**, **Context** (Context shows `0` and a grey "(Phase 14)"), plus "baseline: N solid (to B3 Ch 9) + M studied, unconfirmed (to B4 Ch 4)".
- `src/components/Settings.jsx`: new section **計算 · Counting**:
  - Known threshold: `<select>` of `THRESHOLD_EDGES` with suffix "days" (and the note "One Good on a new card = 3.17 days").
  - Checkbox "Known also requires graduation (Review state)", **on** by default, with the help text from DESIGN §8.4.
  - Baseline: checkbox enabled; two Book + Chapter pickers: "Solid through" (default B3 Ch 9) and "Studied through" (default B4 Ch 4). Validation: studied ≥ solid. Live text: "Solid baseline = 1,2xx words (count as Known) · Studied = 3xx words (count as Seen until reviewed)".
  - Button **Recompute history** → confirm dialog "Rewrite N past snapshots with the current settings?" → `recomputeHistory`.
- `scripts/check-counts.mjs`: add counts for the copy with T = 3 and T = 7, Review-state on/off, baseline on/off, default tiers. Also print today's snapshot JSON.
- `src/App.jsx`: add `counts` to `window.__tt`.

**Edge cases**
- `studySettings.timeZone` decides "today". Test by setting it to `'America/New_York'` in the console late at night Taipei time; the snapshot date changes.
- Changing the threshold must not write past snapshots unless Recompute is pressed.
- Counting must not include outside-TOCFL or CCC-only items.
- If `knownThreshold` is not in `THRESHOLD_EDGES` (hand-edited data), use the largest edge ≤ the value.

**Acceptance checks**
1. The script prints, for the copy: `seen = reviewedTocfl + baselineUntouched + studiedUntouched`, `known ≤ seen`, `known(T=7) ≤ known(T=3)`, `known(review on) ≤ known(review off)`, and with baseline off Known drops by exactly `baselineUntouched` and Seen by `baselineUntouched + studiedUntouched`. Paste the numbers into the commit message.
2. Dev app: the Today card shows the same Seen/Known as the script for the same data (dev data = copy).
3. Change the threshold 3 → 7 in Settings: Known drops instantly. Back to 3: it returns.
4. Move "Solid through" from B3 Ch 9 to B4 Ch 4: Known rises by about 325 minus already-reviewed overlap; Seen doesn't change.
5. Console: `__tt.progress.snapshots.at(-1)` has today's Taipei date, `params.knownThreshold`, and `raw.tails` with 14 keys.
6. Recompute history on a dev copy with ≥ 1 old snapshot: those snapshots get `source:'recomputed'` and their `known` matches `raw.tails[T] + baselineUntouched(d)`.

**Migration:** none (uses v3 fields).

---

## Phase 5 — Dashboard: chart, goals, exam-date selector, pace box

**Session prompt:**
> Read CLAUDE.md, docs/DESIGN.md §5.5, §8.5–8.6, and Phase 5 in docs/PHASES.md. Implement only Phase 5. Run npm run build and fix errors. Commit and push to v2-update.

- **Depends on:** 4.
- **Review with Opus?** No (display only; pace math is small and checkable on screen).
- **Model:** Sonnet.

**Files**
- `src/components/ProgressChart.jsx` (new): Recharts `ResponsiveContainer` height 240 with a `LineChart`. X axis `dataKey="t"`, `type="number"`, `scale="time"`, `domain=[firstSnapshotT, max(todayT, enabled goal endDates)]`, ticks formatted `M/D`. Series: Seen (`#8a8178`), Known (`#c0392b`, thicker), Context (`#2d6a4f`). Data from `snapshots` with today replaced by live counts. Each enabled goal is its own `<Line data={[{t,v},{t,v}]} dataKey="v" strokeDasharray="5 4" dot={false} isAnimationActive={false}>` in a goal color, labelled with `goal.label` at its end. Toggle chips under the chart: Seen / Known / Context (local UI state, persisted in `storageKey('chartSeries')`), and one chip per goal (toggles `goal.enabled`, synced). Tooltip shows date and the three values.
- `src/data/exams.js` (new): `EXAM_DATES` exactly as the table and list in DESIGN §5.5 (dates copied from the official SC-TOP 2026/2027 Taiwan schedules). `upcomingExams(today, kind = 'LR')`, `examById(id)`, `goalEndDate(goal)` (= `examById(goal.examId).date` when set, else `goal.endDate`).
- **Exam selector** (top of PaceBox): a `<select>` of upcoming Listening & Reading dates, labelled e.g. "2027-05-15 · 報名 4/5–4/16". A small line under it shows "Registration opens in N days" / "open now" / "closed". Changing it sets `examId` (and `endDate`) on the selected goal and `updatedAt`.
- `src/components/PaceBox.jsx` (new): a goal `<select>` (enabled goals; stores `studySettings.selectedGoalId`). Rows: "Known today", "Target … by <date>", "Needed / week", "Actual / week (last 4 wks)" (or "based on N days"), "Gap" (red when behind, green when ahead). Formulas exactly as DESIGN §8.6. Numbers are rounded to whole words.
- `src/components/GoalsEditor.jsx` (new): opened by a "Goals ✎" link. For each non-deleted goal: label, start date, start value (blank = auto), end date **or** TOCFL exam (a select of `EXAM_DATES` plus "Custom date"), target, enabled. "Add goal". "Delete" sets `deleted:true`. Every edit sets `updatedAt`. Validation: `endDate > startDate`, target > 0. Inline error text; Save is disabled while invalid.
- `src/components/Dashboard.jsx`: new layout order: (1) Today card (from Phase 4) with "Due today", (2) chart, (3) PaceBox, (4) the existing filter/start card, (5) a collapsed "Details" disclosure holding the old TOCFL/CCC mastery panels. The Dashboard wrapper uses `md:max-w-3xl` (App's container stays `max-w-lg` on phones). At `md` width and up, chart and PaceBox sit side by side in a `grid md:grid-cols-[1fr_220px]`. On phones the pace box sits directly under the chart. **Note:** at 375 px there isn't room for "beside"; this is the deliberate phone layout.
- `src/App.jsx`: pass counts, goals and updaters down.

**Edge cases**
- 0 or 1 snapshot: the chart still renders (single dots plus goal lines). Pace "Actual" shows "—".
- A goal whose end date has passed: excluded from the default pace selection, still drawable.
- A goal with `startValue: null` and a start date before any snapshot → start at the first snapshot's Known.

**Acceptance checks**
1. Phone (dev): Home shows Today, then the chart with three colored lines and a dashed "TOCFL exam" line ending at 5,000 on the selected exam date (default 2027-05-15), then the pace box. Nothing scrolls sideways at 375 px.
2. Tapping the "Seen" chip hides that line; reload → still hidden (per device).
3. Exam selector → pick 2027-03-06 → the dashed line's end moves earlier and "Needed / week" rises. Pick 2027-06-26 → it drops. GitHub `dev/progress.json` shows the new `examId` after sync.
4. Pace check by hand: (5000 − Known today) ÷ (days to end ÷ 7) equals "Needed / week" ± 1.
5. Enable "June 2027": a second dashed line appears.

**Migration:** none.

---

## Phase 6 — Review-log archive, FSRS backfill, course-history estimate

**Session prompt:**
> Read CLAUDE.md, docs/DESIGN.md §5.2–5.2a, §5.6, §7, §8.5, and Phase 6 in docs/PHASES.md. Implement only Phase 6. Run scripts/check-backfill.mjs and scripts/check-log-archive.mjs against local-data/progress.copy.json, then npm run build and fix errors. Commit and push to v2-update.

- **Depends on:** 4, 2.
- **Review with Opus?** **Yes.** It moves log data between files and writes history that drives pace.
- **Model:** Sonnet. If the replay check reports mismatches it can't explain, switch to Opus.

**Files**
- `src/lib/logArchive.js` (new): `planArchive(progress, now, keepDays)` (pure) → `{ months: { 'YYYY-MM': entries[] }, newWatermark }` for entries older than `keepDays`, grouped by local month. `archiveLog(cfg, progress, now)` → for each month: read `dataPath('log/YYYY-MM.json')` (missing = empty), union by `key + at`, sort, write with `putTextFile` (guarded). Only after **all** writes succeed, return progress with those entries removed from `log`, `logArchive.watermark = newWatermark`, `months` updated. Any failure → return the input unchanged and report the error. `loadFullLog(cfg, progress)` → archive files + `progress.log`, deduped and sorted (local mode: `progress.log` only). Hook `archiveLog` into the save flow after `rollupAttempts` (DESIGN §7), at most once per day (timestamp in localStorage).
- `src/lib/backfill.js` (new, pure; imports `ts-fsrs` and the same params as `fsrs.js`, so move `params` into an exported constant in `fsrs.js`): `replayLog(log)` → for each key, the ordered states after each review, starting from `createEmptyCard(firstReviewAt)` and applying `scheduler.next(card, at, rating)`. `backfillSnapshots({ log, progress, index, settings, baselineFor, fromDate, toDate })` → snapshots (`source:'backfill'`) for each local date from the first log date to yesterday that has **no** existing snapshot. Stability per key at the end of day d = the last replayed state at or before d. Context = 0.
- `src/lib/backfill.js` also: `estimateCourseHistory({ index, cccEntries, courseHistory, settings })` → weekly `source:'estimate'` snapshots per DESIGN §8.5 (chapters spread evenly between start and end; Seen = keys first met in completed chapters; Known = the solid-tier part). Only dates with no existing snapshot. Returns `[]` when `courseHistory` is null.
- `src/components/Settings.jsx` → Counting:
  - **Course history**: start date + Book/Chapter, end date + Book/Chapter (saved to `studySettings.courseHistory`), prefilled with the defaults 2025-09-01 · B1 Ch 3 → 2026-08-19 · B4 Ch 4.
  - Button **Build history** → shows "Will add N course-estimate snapshots (A to B) and M review-log snapshots (C to D)" → confirm → `updateProgress`.
- `src/components/ProgressChart.jsx`: `estimate` points drawn as a dashed segment of the same series, with the legend note "dashed = estimated from course".
- `scripts/check-backfill.mjs` (new): runs the replay on the copy. Prints how many keys' final replayed stability equals `cards[key].stability` (tolerance 1e-6) and lists mismatches (first 20). Prints the snapshots it would create (date, seen, known), and the course estimate for a sample `courseHistory` given on the command line.
- `scripts/check-log-archive.mjs` (new): synthetic progress with 20,000 log entries over 300 days → `planArchive` with keepDays 90. Asserts: archived + kept = original (by `key + at`), no entry in both, kept entries all newer than the watermark. Then simulates a failed write and asserts the progress is unchanged.

**Edge cases**
- Keys in the log whose card is missing → skip, and count them in the report.
- Archive file exists from another device → union, never overwrite.
- Never overwrite an existing snapshot (live, backfill or estimate).
- The course period overlaps the review log (log from 2026-06-22 to the course end 2026-08-19). For those dates, write `backfill` snapshots whose baseline part is the course-estimated baseline for that date (chapters completed by then), plus the replayed FSRS cards. After `courseHistory.end.date`, use the configured baseline tiers. Pure `estimate` snapshots are only written before the first log date, so the curve is continuous.

**Acceptance checks**
1. The backfill script shows ≥ 95% of reviewed keys matching. Explain any mismatches in the commit message (expected cause: cards reviewed before the log started, or legacy keys).
2. The archive script prints PASS.
3. After **Build history** with the default course dates: the chart shows a dashed estimated curve starting 2025-09-01 and rising to about 1,600 Seen / 1,270 Known, then solid points from 2026-06-22 onward. Running it again says "Will add 0".
4. In dev, run `__tt.setLogKeepDays(1)` in the console (add this dev-only helper to `window.__tt`), rate a card to trigger a save: `dev/log/2026-10.json` (etc.) appears in the data repo, `progress.log` shrinks, and **Build history** still sees every entry.

**Migration:** none (uses v3 fields).

---

## Phase 7 — Session timer, manual entries, hours chart

**Session prompt:**
> Read CLAUDE.md, docs/DESIGN.md §5.15–5.16 and §13, and Phase 7 in docs/PHASES.md. Implement only Phase 7. Run npm run build and fix errors. Commit and push to v2-update.

- **Depends on:** 1B (place the hours chart on the Phase 5 dashboard if it exists; otherwise at the top of the Home view).
- **Review with Opus?** No.
- **Model:** Sonnet.

**Files**
- `src/lib/sessions.js` (new): `startSession()`, `noteActivity(activity, listIds, kind)` (kind `'review'|'attempt'`), `endSession(at)` → `StudySession`, `loadActive()`/`saveActive()` using `storageKey('activeSession')`, `hoursByWeek(sessions, manualEntries, tz, weeks = 8)` → `[{weekStart, timerH, manualH}]`.
- `src/components/SessionTimer.jsx` (new): in the header next to the sync dot. Idle: a small "▶ 開始" pill. Running: a cinnabar pill with `mm:ss` (updates each second) and "■". Tapping ■ ends the session, calls `addSession`, then `snapshotNow()` (if Phase 4 exists).
- On app start, if the active session is > 12 h old: modal "You left a session running since <start>. End it at <last activity> / End now / Discard". "Discard" writes nothing.
- `src/components/ManualEntryForm.jsx` (new): fields per DESIGN §13 (date default today in the Taipei zone; minutes required 1–600; practice type select with an "Other" text box; material select with presets + "Other…" text; notes). Below it: the last 10 entries with Edit/Delete (tombstone).
- `src/components/HoursChart.jsx` (new): stacked BarChart (timer `#1a6b8a`, manual `#b8860b`), 8 weeks, plus the text "This week: X.X h".
- `src/hooks/useProgress.js`: `addSession(s)`, `upsertManualEntry(e)`. `rate()` calls `noteActivity('flashcards', currentListIds, 'review')` (App passes the current list ids; before Phase 8, pass `[]`).
- `src/App.jsx` / `Dashboard.jsx`: show HoursChart and a "+ 手動紀錄" button opening the form (sheet/modal).

**Edge cases**
- A session with no activity still records its time (you may be reading a textbook).
- Timer across midnight: the session belongs to its start date's week.
- The phone is locked during a session: on return, the elapsed time is computed from `start`, not from ticks.

**Acceptance checks**
1. Tap ▶, review 3 cards, wait until the timer shows 1:00+, tap ■. Console: `__tt.progress.sessions.at(-1)` has `durationSec ≥ 60`, `activities: ['flashcards']`, `counts.reviews: 3`.
2. Reload mid-session: the timer continues from the right time.
3. Add a manual entry "Listening · Podcast · 30 min" → the bar for this week grows by 0.5 h in the manual color.
4. Delete it → the bar shrinks. In the JSON it is still present with `deleted: true`.

**Migration:** none.

---

## Phase 8 — Lists (incl. CCC parts), multi-select study picker, queue rewrite (no cap, learning re-show)

**Session prompt:**
> Read CLAUDE.md, docs/DESIGN.md §5.7, §8.2, §9, and Phase 8 in docs/PHASES.md. Implement only Phase 8. Run npm run build and fix errors. Commit and push to v2-update.

- **Depends on:** 3, 4.
- **Review with Opus?** **Yes.** Baseline exclusion and the queue decide what you study and what counts.
- **Model:** Sonnet. This is the largest UI phase; if the session runs long, stop after the queue + picker (acceptance 1–4), commit, and do the Lists view in a second session with the same prompt plus "continue Phase 8 from where the last commit stopped".

**Files**
- `src/lib/lists.js` (new): `cccLists(cccVocab)` → virtual lists `ccc:b{book}c{chapter}`, named `當代 B{book} 第{chapter}課`, plus one per part present, `ccc:b{book}c{chapter}p{part}`, named `當代 B{book} 第{chapter}課 {part}`. `getAllLists(progress, cccVocab)`. `createCustomList(name)`. `addItems(listId, keys)`. `removeItems(listId, keys)`. `renameList`. `deleteList` (tombstone; CCC lists can't be deleted).
- `src/lib/queue.js` (new): `buildFlashcardQueue({ selection, lists, index, progress, baseline, settings, now })` → `{ queue, stats: {due, fresh, baselineSkipped, total} }`, exactly per DESIGN §9.4. `requeueAfterRating(queue, pos, key, card, now)` → the learning re-show rule in §9.4.
- `src/components/StudyPicker.jsx` (new; replaces FilterCard + DangdaiFilter): activity tabs (only **Flashcards** for now). Selection UI:
  - TOCFL band chips (Novice/A/B/C).
  - CCC: Book accordion, each with a "whole book" checkbox, then chapter checkboxes showing `due·new`; each chapter row has a small ▸ that reveals its part checkboxes (I / II / III) with their own `due·new`. Any mix of chapters and parts can be selected.
  - Pleco and Custom sections (empty-state text until Phase 9 / until you create one).
  - Switch "Include baseline words" (off by default): includes untouched solid-baseline words so you can check them.
  - Session size: chips **20 · 50 · 100 · All** plus a number box, and "New cards: All / number" (DESIGN §9.4). Default All / All.
  - Footer: "N due · M new · K baseline skipped" and **Start T cards**, where T is the exact queue length. The selection (including size) persists in `storageKey('selection')`.
- `src/components/ListsView.jsx` (new; nav tab 清單): all lists grouped by type with item counts and `due·new·known`. "New custom list". Tapping a list opens `ListDetail`.
- `src/components/ListDetail.jsx` (new): name (editable for custom), item table (hanzi, pinyin, english, band, status chip: new/learning/known/baseline), "Add words" search for custom lists (substring match on hanzi, pinyin without tones, or english; max 50 results), "Remove" per item for custom lists, "Study this list" (sets the selection to this list and opens the picker). The old TOCFL/CCC mastery panels move to the top of ListsView as "Overview".
- `src/App.jsx`: remove `useStudyFilter`, `dangdaiFilter`, `filteredVocab`, `buildQueue`. Use `buildFlashcardQueue`. After each rating call `requeueAfterRating`, so Learning/Relearning cards come back in the same session. At the end, if learning cards are still waiting: "n cards still learning — Continue / Finish". Nav: 首頁 · 清單 · 檔案 · 設定. One-time conversion: if the old `storageKey('studyFilter')` exists and `storageKey('selection')` doesn't, map enabled bands → `tocflBands`, and an old `dangdai` book+chapter → that CCC list id. The old key is left in place.
- `src/hooks/useProgress.js`: `upsertList`, `deleteList`. (Card creation on first rating already exists from Phase 1B.)
- `src/components/Settings.jsx`: remove the "Study levels" section and the `enabledBands` toggle. No session-size setting: size is chosen in the picker.
- Delete `src/hooks/useStudyFilter.js` and `src/components/DangdaiFilter.jsx`.
- Dashboard: the start card is replaced by `StudyPicker`.

**Edge cases**
- Baseline exclusion applies only to items that come **only** from band or CCC selections. If the same word is also in a selected Pleco/custom list, include it.
- Selecting nothing → Start is disabled with "Nothing selected".
- Thousands of new cards (band B): the queue holds them all. The header shows `1 / 3,xxx`. You can end any time with "← 結束".
- Homographs stay separate keys.

**Acceptance checks**
1. Select TOCFL band B only, size All → the footer shows a "new" count over 2,000. Start → the header shows `1 / <same total>` (not 40).
2. Size 50 → Start → `1 / 50`. Size All, New cards 10 → total = due + 10.
3. Default baseline: select CCC Book 2 Ch 1 only → `0 due · 0 new · N baseline skipped` (N > 0), except for words you have actually reviewed. Turn on "Include baseline words" → those N appear as new.
4. Select B4 Ch 1 part I + B4 Ch 3 part II → the counts equal the sum of those two parts (minus shared words). Select B4 Ch 3 and also its part II → no double counting.
5. Learning re-show: start a session with new cards, press Good on the first one → it comes back about 5 cards later. Press Good again → console `__tt.progress.cards['<key>'].state` is `2` (Review).
6. Lists → New custom list "測試" → add 好像 and 遺憾 → Study this list → 2 cards. Reload → the list is still there. After sync, `dev/progress.json` has `lists["custom:…"]`.
7. Reload after the update on a device that had an old CCC filter: the picker shows that chapter pre-selected.

**Migration:** none in progress.json (the selection is a per-device localStorage key).

---

## Phase 9 — Pleco XML import

**Session prompt:**
> Read CLAUDE.md, docs/DESIGN.md §4.3, §5.7–5.9, §9, and Phase 9 in docs/PHASES.md. Implement only Phase 9. Test with docs/samples/pleco-sample.xml as described, then npm run build and fix errors. Commit and push to v2-update.

- **Depends on:** 8.
- **Review with Opus?** No. It's additive and never edits existing cards, but follow the sample check exactly.
- **Model:** Sonnet.

**Files**
- `src/lib/pleco.js` (new, pure except `DOMParser`, which is passed in for Node):
  - `parsePlecoXml(text, DOMParserImpl)` → `{ cards: [{ tc, sc, pronNumeric, pinyin, defn, dictref, categories[] }], errors[] }`. Structure (verified): `plecoflash > cards > card`. Inside `card`: `entry > headword[charset=tc|sc]`, `entry > pron[tones=numbers]`, `entry > defn`, `dictref[dictid][entryid]`, `catassign[category]` (0..n).
  - `numericToToneMarks(s)`: lowercase; `u:` and `v` → `ü`; tokens `/[a-zü]+[1-5]?/g`; for a tone 1–4 put the mark on `a`, else `e`, else the `o` of `ou`, else the last vowel; tone 5 or no digit → no mark; join with no spaces. Examples that must hold: `xin1ren4→xīnrèn`, `nai3nai5→nǎinai`, `fu2zhuang1→fúzhuāng`, `lu:4→lǜ`, `nv3er2→nǚér`, `hua1r5→huār`.
  - `classify(card, index)`: uses `index.match(tc, pinyin)`. `exact|normalized|variant` → `auto`. `hanzi-unique|ambiguous` → `resolve` (with candidates). `none` → if a CCC item key matches under `normPinyin`, `auto` with that CCC key (not TOCFL), else `outside`. A missing `tc` headword → `resolve` with reason "no traditional headword".
  - `applyPlecoImport(progress, decisions, fileName, now)` → new progress: one list per category `pleco:<category>` (union with an existing list; never removes keys); `customItems` for `outside` (english = defn text before the first CJK char, trimmed, max 120 chars; fallback the first 60 chars; tags `['outside-TOCFL']`); `itemNotes[key].pleco = { defn: defn.slice(0,400), dictref:'PACE:33411328', categories }`. Cards are created lazily on first rating, so none are created here.
- `src/components/PlecoImport.jsx` (new; ListsView → "匯入 Pleco"): pick a file (`accept=".xml,text/xml"`) or paste the XML. Preview: per category, the count of auto / outside / needs-resolve. Resolve list: each row shows the Pleco hanzi + converted pinyin + the first 80 chars of defn, then radio buttons for each candidate (`hanzi pinyin — english [band]`), "Not in TOCFL (outside)", "Skip". **Import** is disabled until every resolve row has a choice. Afterwards: summary "Imported 10 words into 11月學字 (7 TOCFL, 3 outside-TOCFL)".
- `ListDetail.jsx`: outside-TOCFL items show a grey "非TOCFL" chip. A Pleco reference disclosure shows `itemNotes.pleco.defn`.
- `scripts/check-pleco.mjs` (new; adds no dependency): Node has no `DOMParser`, so the script pulls `tc`, `pron` and `catassign` out of the sample with regexes (script-only shortcut). It then calls `numericToToneMarks` and `classify` from `src/lib/pleco.js` and prints the converted pinyin and status per card, plus the six `numericToToneMarks` examples above as PASS/FAIL.

**Edge cases**
- A card in 2 categories → it appears in both lists.
- Re-importing the same file → no new items, lists unchanged, "0 new".
- Defn with newlines is kept as-is in the note.
- A large file (2,000 cards) → the preview must not freeze: classify in chunks of 200 with `await new Promise(r => setTimeout(r))`.

**Acceptance checks** (with `docs/samples/pleco-sample.xml`, 10 cards, category `11月學字`)
1. Preview: **7 auto** (服裝, 遺憾, 完整, 實際, 拒絕, 外婆, 奶奶 — all exact), **3 outside** (新任, 爬山, 溫馨; outside unless they appear in CCC, in which case they're auto-CCC), 0 resolve.
2. Import → Lists shows "11月學字" with 10 items, and the 3 outside ones carry 非TOCFL. Dashboard Known/Seen do not change.
3. 奶奶 shows pinyin `nǎinai`, english from the dataset (not Pleco).
4. Import the same file again → "0 new words".
5. Edit a copy of the sample so that one card has `<headword charset="tc">行</headword>` and `<pron …>xing2</pron>` → that card lands in **resolve** with the 行 candidates listed.

**Migration:** none.

---

## Phase 10 — Natural OS voices

**Session prompt:**
> Read CLAUDE.md, docs/DESIGN.md §14.1, and Phase 10 in docs/PHASES.md. Implement only Phase 10. Run npm run build and fix errors. Commit and push to v2-update.

- **Depends on:** 0.
- **Review with Opus?** No.
- **Model:** Sonnet.

**Files**
- `src/lib/speech.js`: `listVoices()` (sorted per §14.1); `getTtsPrefs()`/`setTtsPrefs({voiceURI, rate})` via `storageKey('tts')`; `speak(text, rateOverride)` uses the stored voice when it is still available, otherwise falls back to the current rule. Keep `onvoiceschanged` priming. Add `speakAsync(text)` → a Promise resolved on `onend` (Phase 12 uses it).
- `src/components/Settings.jsx`: section **聲音 · Audio**: voice `<select>` (label `name (lang)`, and ★ for Enhanced/Premium), rate slider 0.6–1.1 step 0.05, **Test** button, and the help text from DESIGN §14.1.
- `src/components/Flashcard.jsx`: no change (it already calls `speak`).

**Edge cases**
- iOS returns an empty voice list until the first `voiceschanged`: the select shows "Loading voices…" and re-renders on the event.
- A saved voice that disappeared (different device) → fall back silently.

**Acceptance checks**
1. Phone: Settings → Audio lists several zh voices, zh-TW first. Picking "Meijia" (or any other) and tapping Test speaks the test sentence in that voice.
2. A flashcard's 播放發音 uses the chosen voice and rate.
3. After downloading an Enhanced/Premium voice in iOS Settings and reloading, it appears with ★.

**Migration:** none.

---

## Phase 11 — Exercise input export, validator, import, storage

**Session prompt:**
> Read CLAUDE.md, docs/DESIGN.md §5.10, §10, and Phase 11 in docs/PHASES.md, plus docs/prompts/generate-exercises.md. Implement only Phase 11. Run scripts/check-validator.mjs, then npm run build and fix errors. Commit and push to v2-update.

- **Depends on:** 8.
- **Review with Opus?** No. Only metadata goes into progress; the validator only rejects.
- **Model:** Sonnet.

**Files**
- `src/lib/exerciseInput.js` (new, pure): `batchesOf(list)` (20 per batch), `typePlan(batchKeys, variant)` (rotation + cloze grouping per DESIGN §10.1), `buildInputFile({ list, batch, variant, index, existingFiles })` → the JSON in §10.2 (`avoid` built from existing file contents for the same list and batch), `inputFileName(…)`.
- `src/lib/exerciseValidator.js` (new, pure, never throws): exactly DESIGN §10.4. The simplified-character list is a constant string in this file.
- `src/lib/exerciseStore.js` (new): `fileIdFor(listId, batch, variant, text)` (shortHash = the first 6 hex chars of a simple FNV-1a of the text), `pathFor(listId, fileId)`, `saveExerciseFile(cfg, meta, json)` (guarded `putTextFile`; in local mode cache only), `loadExerciseFile(cfg, meta)` (cache `storageKey('exfile.'+id)`, else `readFileContent`).
- `src/components/ExerciseImport.jsx` (new; inside ListDetail → tab "練習題 · Exercises"):
  - **Step 1, generate:** batch select, variant select (default: the lowest variant with no file for that batch). Buttons **Download input file** (Blob) and **Copy input JSON**. **Copy prompt** copies the text of `docs/prompts/generate-exercises.md` (imported with `?raw`).
  - **Step 2, import:** a textarea "Paste the AI's JSON" plus a file picker. **Check** runs the validator and shows the report (accepted, rejected with reasons, warnings). **Import N exercises** saves and adds `exerciseFiles[id]`.
  - A list of this list's files: batch, variant, questions, date, reviewed ✓. "Delete" (tombstone meta only; the repo file stays).
- `scripts/fixtures/exercises-good.json` (4 exercises, one per type, using items from the sample Pleco list, all valid) and `scripts/fixtures/exercises-bad.json` (an answer not among the options; a cloze with 2 blanks; an unknown target key; duplicate options; simplified 们 in a sentence; a fill whose answer ≠ target hanzi).
- `scripts/check-validator.mjs` (new): validates both fixtures against an index built as in check-counts. Expects good: 4 accepted, 0 rejected; bad: the per-exercise reasons above (5 rejected, 1 warning for 们). It also checks that a truncated JSON string returns `fatal` and doesn't throw.

**Edge cases**
- The pasted text has ```` ```json ```` fences or a leading "Here is your file:" → stripped.
- The output `listId` doesn't match the current list → a warning "File says list X; importing into Y", and the import is allowed.
- Repo path with CJK characters → `encodeURIComponent` handles it (already done in `putTextFile`).

**Acceptance checks**
1. `node scripts/check-validator.mjs` → the expected counts, and `fatal` for truncated input.
2. Phone: Lists → 11月學字 → Exercises → Copy input JSON → paste it into Notes: it shows 10 items, a `plan` with types, and `variant: 1`.
3. Paste `scripts/fixtures/exercises-bad.json` content → the report lists 5 rejected with readable reasons. The app doesn't crash.
4. Paste the good fixture → Import 4 → in dev, the data repo has `dev/exercises/pleco_11月學字/<id>.json` and progress has `exerciseFiles[<id>]`.
5. Download the input for variant 2 → its `avoid.sentences` includes the sentences from the imported variant 1 file.

**Migration:** none.

---

## Phase 12 — Exercise player and practice mode, attempt log

**Session prompt:**
> Read CLAUDE.md, docs/DESIGN.md §5.12, §11.1–11.2, and Phase 12 in docs/PHASES.md. Implement only Phase 12. Run npm run build and fix errors. Commit and push to v2-update.

- **Depends on:** 11, 10.
- **Review with Opus?** No (appends to a log; rollup comes in 13).
- **Model:** Sonnet.

**Files**
- `src/lib/context.js` (new): `questionRefs(files)` (expands files to `{ref, fileId, exId, q, type, key}`; skips `exerciseFlags` disabled), `pickPracticeQuestions({ refs, progress, types, count: 20 })` (order per §11.2; the gap list isn't available until Phase 14, so sort by fewest attempts, then random), `recordAttempt(progress, attempt)`.
- `src/components/ExercisePlayer.jsx` (new): props `{ refs, loadFile, mode, runId, onAttempt, onFinish }`. Rendering per DESIGN §11.1. `[[n]]` → a numbered underlined box (the active one highlighted). Listening uses `speakAsync(audioText)` and a "▶ 再聽 (n)" counter. After answering: green/red states, explanation, the target `hanzi pinyin english`, **Next**. The end screen shows "x / y correct" and a list of misses.
- `src/components/StudyPicker.jsx`: enable activity tabs **Cloze, Fill, Usage, Listening, Mixed** when the selected lists have files with those types. Otherwise a tab shows a disabled state "No exercises yet — import in Lists → Exercises". Start → the player in `mode:'practice'`.
- `src/hooks/useProgress.js`: `addAttempt(a)` (appends; no cap yet). It calls `noteActivity(type, [listId], 'attempt')`.
- `ListDetail.jsx`: a **Practice** button in the Exercises tab.

**Edge cases**
- A file failing to load (offline, deleted) → skip its questions and show "1 file couldn't load".
- Double-tapping an option → only the first tap counts.
- No zh voice available → the listening tab shows "No Chinese voice on this device" and is disabled.

**Acceptance checks**
1. With the good fixture imported: Home → select 11月學字 → Cloze → Start → the passage shows with blanks. Choosing wrong turns it red, shows the explanation and the correct option in green.
2. Listening plays audio. The sentence text appears only after answering.
3. Console: `__tt.progress.attempts.at(-1)` has `mode:'practice'`, `chosen`, `ms > 0`, and `key` equal to the target.
4. The phone layout at 375 px: 4 option buttons are full width, and usage sentences wrap without overflow.

**Migration:** none.

---

## Phase 13 — List tests with variants, test history, attempt rollup

**Session prompt:**
> Read CLAUDE.md, docs/DESIGN.md §5.13–5.14, §9.2, §11.3–11.4, and Phase 13 in docs/PHASES.md. Implement only Phase 13. Run scripts/check-merge.mjs and the new rollup check, then npm run build and fix errors. Commit and push to v2-update.

- **Depends on:** 12, 2.
- **Review with Opus?** **Yes.** Rollup removes raw records (folding them into the archive) and interacts with merge.
- **Model:** Sonnet.

**Files**
- `src/lib/lists.js`: `variantsOf(listId, exerciseFiles)`, `latestScore(listId, variant, testRuns)`, `nextVariant(listId, …)` per DESIGN §9.2.
- `src/lib/context.js`: `rollupAttempts(progress, now)` per §11.4 (pure).
- `src/hooks/useProgress.js`: call `rollupAttempts` on the merged object before PUT (DESIGN §7). `startTestRun`, `finishTestRun`, `abandonTestRun`.
- `src/components/ListDetail.jsx` → section **測驗 · Tests**: a row per variant: "Test 2 — 17/20 (85%) · Nov 3" or "not taken". A **Take test** button (serves `nextVariant`; a small "choose variant" link lets you override). A "History" disclosure lists all finished runs for the list (date, variant, score), newest first.
- `ExercisePlayer`: in test mode, the header shows "Test · Variant n · q/N". The end screen shows the score and "Saved as latest score for Test n". Leaving early asks "Abandon test? It won't count." → `status:'abandoned'`.
- `scripts/check-rollup.mjs` (new): builds a synthetic progress with 3,600 attempts spread over 120 days, runs `rollupAttempts`. Asserts: length ≤ 3,000 (or all remaining are < 60 days old); for every key, archive.n + raw.n equals the original total, and the same for correct counts; the watermark equals the newest archived `at`. Then it merges with a copy that still has the raw attempts and asserts there is no double counting.

**Edge cases**
- A list with variant files for some batches only → the test uses what exists. The row shows "(2 of 3 batches)".
- An in-progress run on another device: merge keeps the later `updatedAt`. A run left `in-progress` for > 24 h shows as abandoned in the UI (the stored status is changed on the next finish/abandon action only).

**Acceptance checks**
1. With variants 1 and 2 imported: Take test → serves Test 1. Finish → the row "Test 1 — x/y". Take test again → serves **Test 2**.
2. Retake Test 1 (via "choose variant") with a different score → the row shows the new score. History lists both runs.
3. `node scripts/check-rollup.mjs` → PASS. `node scripts/check-merge.mjs …` still PASS.

**Migration:** none.

---

## Phase 14 — Context rule, understanding score, gap list, verify-file import

**Session prompt:**
> Read CLAUDE.md, docs/DESIGN.md §5.11, §10.6, §11.5–11.6, §8.3, and Phase 14 in docs/PHASES.md. Implement only Phase 14. Run scripts/check-counts.mjs, then npm run build and fix errors. Commit and push to v2-update.

- **Depends on:** 13, 4.
- **Review with Opus?** **Yes.** It adds the third dashboard count.
- **Model:** Sonnet.

**Files**
- `src/lib/context.js`: `contextStats(key, progress, settings)` (including `typesCorrect` and `understanding`) and `contextQualified(key, progress, rule)` exactly per §11.5. Attempts of type `sentence` count only when `rule.sentencesCount`. `gapList(progress, index, settings)` per §11.6.
- `src/lib/counts.js`: pass the real `contextQualified` into `computeCounts`. Snapshots now carry non-zero `context`.
- `src/components/Settings.jsx` → Counting → **Context rule**: one row per setting in the DESIGN §11.5 table, each with its one-line meaning as help text (min correct, min distinct exercises, require different types, min recent accuracy %, recent window, graded sentences count). **Understanding score**: max (default 10) and points per type. Put every default in `DEFAULT_STUDY_SETTINGS` so it's changed in one place.
- Understanding bar: a 10-segment bar with "n/10" on the flashcard back, in `ListDetail` rows, and in the gap list.
- Dashboard: the Today card's Context number becomes live. A new card **Context gaps: N** → "Practice gaps" opens the player in practice mode over refs whose key is in the gap list (only words that have exercises; it also shows "M gap words have no exercises yet").
- `context.js` `pickPracticeQuestions`: put gap-list keys first (completing §11.2).
- `ExerciseImport.jsx`: the import box also accepts `format: "tocfl-tutor.exercise-review"`: match each finding's `exId` among this list's files (report unknown ids), then apply `exerciseFlags` per DESIGN §10.6. Show "3 questions disabled, 2 warnings". Disabled questions show as struck through in the file list with a **Re-enable** button (sets `status:'warning', from:'user'`).
- `scripts/check-counts.mjs`: add a synthetic attempts section: for one key, 2 correct attempts on 2 different exercises → qualified; 2 correct on the same exercise → not qualified.

**Edge cases**
- Untouched baseline words never count as Context, even with attempts. They count once they have attempts **and** qualify (Context doesn't depend on Known).
- Outside-TOCFL words never count toward Context.
- Changing the rule updates today's number immediately. Past snapshots keep their stored context (DESIGN §8.5).

**Acceptance checks**
1. Answer two different exercises for 遺憾 correctly → Context goes up by 1 (with the default rule).
2. A word with Known stability and 0 attempts appears in Context gaps.
3. Import a review file that marks one question `wrong-answer` → it disappears from practice and tests. Re-enable brings it back.
4. The script's synthetic check passes, plus: 3 correct cloze answers on one word → understanding 3; with `requireDistinctTypes` on, 2 correct cloze answers on 2 different exercises → not qualified, cloze + usage → qualified.
5. Settings → Counting: change min correct to 3 → Context drops immediately; set it back → it returns.

**Migration:** none.

---

## Phase 15 — Sentence writing and grading

**Session prompt:**
> Read CLAUDE.md, docs/DESIGN.md §5.17 and §12, and Phase 15 in docs/PHASES.md, plus docs/prompts/grade-sentences.md. Implement only Phase 15. Run npm run build and fix errors. Commit and push to v2-update.

- **Depends on:** 1B, 8.
- **Review with Opus?** No.
- **Model:** Sonnet.

**Files**
- `src/components/SentenceBox.jsx` (new): under the rating row in `Flashcard`, a collapsed "✎ 造句 · Write a sentence" button opening a textarea (Traditional input is up to you) plus **Save**. Saved → a toast "Queued (n)". If this word has a graded sentence, show the latest: ✓/✗ correct, natural, corrected sentence, note.
- `src/hooks/useProgress.js`: `addSentence`, `markExported(ids)`, `applyGrades(results)`. `applyGrades` also upserts one attempt per graded entry, `id: 'a_sent_' + entry.id`, `type:'sentence'` (DESIGN §12), so graded sentences feed Context and the understanding score (live from Phase 14).
- `src/components/Settings.jsx` → section **造句 · Sentences**: queued count; **Export grading packet** (Blob download + **Copy**; marks the entries `exported`); **Copy grading prompt** (raw import of `docs/prompts/grade-sentences.md`); **Import grades** (paste or file). The import report: "8 graded, 1 unknown id".
- Flashcard keyboard shortcuts must ignore keystrokes while the textarea has focus (already true for TEXTAREA; verify).

**Edge cases**
- Empty or whitespace sentence → Save disabled.
- Grades for an already-graded id → overwrite and keep `gradedAt` = now.
- Non-JSON paste → a readable error, no crash.

**Acceptance checks**
1. Write two sentences on two cards → Settings shows "2 queued". Export → the file has both with dates. Queued becomes 0, exported 2.
2. Paste a hand-made grades JSON for one id → the card shows the corrected sentence next time it appears. Console: `__tt.progress.attempts.filter(a => a.type === 'sentence').length` → 1. Import the same grades again → still 1.

**Migration:** none.

---

## Phase 16 — Tone trainer fix

**Session prompt:**
> Read CLAUDE.md, docs/DESIGN.md §14.2, and Phase 16 in docs/PHASES.md. Implement only Phase 16. Run npm run build and fix errors. Commit and push to v2-update. Then tell me exactly what to try on my phone.

- **Depends on:** 0. Testing needs HTTPS on the phone (`npm run dev:phone`, WORKFLOW §4).
- **Review with Opus?** No (no data).
- **Model:** Sonnet. It can't hear or see your phone, so expect 1–2 rounds where you report what the diagnostic shows.

**Files**
- `src/lib/pitch.js`: replace `startRecording()` with the PCM capture design in DESIGN §14.2. Keep the same return shape (`{ cancel(), stop() → {points, voiced, reason} }`) so `Flashcard.jsx` doesn't change. Delete `pickMime` and the decode path. `startRecording` must create the `AudioContext` **before** its first `await`, because iOS requires the user gesture.
- `src/components/MicTest.jsx`: add a **Record 2 s** button that uses the new capture and prints: sampleRate, samples captured, peak absolute level, detected voiced frames, and any error text.
- `src/components/Flashcard.jsx`: `toggleRecord` must call `startRecording()` synchronously inside the click handler (no awaits before it).

**Edge cases**
- Permission denied → "Microphone permission denied. iOS Settings → Chrome → Microphone."
- No sound captured (peak < 0.01) → "Didn't hear anything — check the mic isn't muted."
- Sample rate 48000 vs 44100 → `analyzeContour` already takes `sr`.

**Acceptance checks**
1. Phone over `https://<mac>.local:5173`: Settings → Mic test → Record 2 s → shows sampleRate 48000 (or 44100), samples ≈ 2 × sampleRate, peak > 0.05 while speaking.
2. Flashcard 🎤 → say the word → ■ → a pitch curve is drawn over the reference, with a score. No "Unable to decode audio data".

**Migration:** none.

---

## Deferred (not scheduled)
Grammar on FSRS, with TBCL and CCC grammar lists (DESIGN §16.2; needs the grammar data first). Using context results to adjust FSRS. Speech-recognition practice (`recognizeOnce` exists, unused).
