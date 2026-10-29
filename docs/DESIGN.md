# DESIGN — 習字 / TOCFL Tutor v2

Status: architecture for the `v2-update` branch. Written 2026-10-28 against the code in the repo on that date. **Revised 2026-10-29** with Shane's answers (RISKS §E): private data repo, no stub cards, no session cap, two-tier baseline, part-level CCC lists, TOCFL exam dates, understanding score, review-log archive, grammar on FSRS. **Revised 2026-10-30:** word data rebuilt from the original sources as one item per *sense*, with variant characters and the six TOCFL levels (§4.4, Phase 2.5).
Every phase in `docs/PHASES.md` implements against this file. If code and this file disagree, this file wins unless a phase says otherwise.

Contents
1. Principles
2. Current system (verified)
3. Data modes (dev vs live) and the write guard
4. Item model (words now, grammar later)
5. progress.json schema v3 (field level)
6. Migration plan (v1/v2 → v3) and backups
7. Sync: merge-on-save
8. Counting: Seen, Known, Context, baseline, snapshots, goals, pace
9. Lists
10. Exercise files: input file, output file, validator, review file
11. In-app exercises, tests, attempt log, context score, gap list
12. Sentence writing and grading
13. Study sessions and manual entries
14. Audio (TTS) and tone trainer
15. Settings: synced vs per-device
16. Grammar: what is built now, what is deferred
17. File map (new and changed modules)

---

## 1. Principles

- **Never lose progress.** Every write to `progress.json` goes through `migrate()` and `mergeProgress()`. Unknown fields are preserved. Nothing is physically deleted: records get `deleted: true` tombstones. **One approved exception (Shane, 2026-10-29):** empty stub cards (`reps === 0`, never rated, no log entry) carry no study information and are removed by the v3 migration and by merge (§6.1, §7). A backup is written first.
- **Private data, public code.** All study data lives in a separate **private** GitHub repo (the *data repo*, §3). The app repo (public, serves GitHub Pages) holds code only. The app never writes to the app repo.
- **Recomputable counts.** Today's numbers are always computed live from card state. Stored history keeps enough raw data (stability tail counts and `firstSeen` dates) to recompute past points when a threshold or the baseline chapters change.
- **One item concept.** Everything (cards, lists, exercises, attempts) is keyed by an *item key*. A word key is `hanzi|pinyin` (unchanged from today). A grammar key is `g:<slug>`. Type comes from the key.
- **Small synced file.** Exercise content lives in separate data-repo files, not in `progress.json`. Old review-log entries move to monthly archive files (never dropped); old context attempts are rolled up.
- **Dumb AI, smart app.** The app decides batching, exercise-type rotation, and what to avoid. The AI only writes content to a fixed plan, and the app validates every item.

## 2. Current system (verified)

| Area | What the code does today | File |
|---|---|---|
| Build | Vite 5 + React 18 + Tailwind 3. `build.outDir: 'docs'`, `emptyOutDir: true` | `vite.config.js` |
| Deploy | Actions workflow on push to `main`: `npm install`, `npm run build`, upload `docs/` to Pages | `.github/workflows/deploy.yml` |
| Vocab | `SEED_VOCAB`: 7,517 TOCFL rows (`hanzi, pinyin, english, band, tones`, `source:'tocfl'`), 7,215 unique `hanzi|pinyin` keys. One gloss per key, no POS, variants dropped. **Rebuilt in Phase 2.5 (§4.4)** | `src/data/vocab.js` |
| CCC | 6 JSON packs, 4,960 rows (`hanzi, pinyin, english, book, lesson, part, band[], tones, pos`), loaded **at runtime** from the repo `vocab/` folder through the GitHub API, only when a token is set | `vocab/cccc-book*.json`, `src/lib/vocab.js` |
| FSRS | ts-fsrs 4.7.1, default weights, `enable_fuzz: true`. Card stored as plain JSON with `hanzi, pinyin` | `src/lib/fsrs.js` |
| Progress | `{ version, cards, log, updatedAt }`. A stub card is created for **every** vocab word at load. Log capped at 5,000 | `src/hooks/useProgress.js` |
| Sync | GET then PUT of the whole file through the Contents API, after a 1.5 s debounce. Last writer wins. Branch and path come from Settings (default `main` / `progress.json`) | `src/lib/github.js` |
| Queue | Due cards plus unseen cards from the filter, `.slice(0, 40)` | `src/App.jsx` `buildQueue` |
| Filters | TOCFL band checkboxes plus a single CCC selection `{book, chapter, list}` | `useStudyFilter.js`, `DangdaiFilter.jsx` |
| TTS | `speechSynthesis`, first `zh-TW` voice, rate 0.85 | `src/lib/speech.js` |
| Tone trainer | MediaRecorder → Blob → `decodeAudioData` → YIN pitch | `src/lib/pitch.js` |

`docs/RISKS.md` lists every place where this differs from your notes.

## 3. Data modes (dev vs live) and the write guard

### 3.0 Two repos
| Repo | Visibility | Holds | Written by |
|---|---|---|---|
| App repo `shanesilverman0-bot/Chinese-Study-Tool` | public (needed for free GitHub Pages) | code, docs, bundled TOCFL + CCC data | you and Claude Code (git), never the app |
| Data repo `shanesilverman0-bot/Chinese-Study-Data` | **private** | `progress.json`, `backups/`, `exercises/`, `log/`, extra `vocab/` packs, and the same tree under `dev/` for test data | the app only (through the GitHub API with your token) |

Why: GitHub Pages on a free account only serves public repos. Splitting code from data keeps the site free while your progress, sentences and exercises stay private. A side benefit: data saves no longer touch the app repo, so they never trigger a site deploy. The app reads the data repo with a **fine-grained personal access token** limited to that one repo (Contents: read and write), stored per device in localStorage, exactly like today's token.

The data repo has one branch, `main`. Live data sits at the root; test data sits under `dev/`:
```
progress.json            dev/progress.json
backups/…                dev/backups/…
exercises/<list>/…       dev/exercises/<list>/…
log/YYYY-MM.json         dev/log/YYYY-MM.json
vocab/*.json             (extra packs; read by both modes, written by neither)
```

### 3.1 Modes

`src/lib/dataMode.js` exports `DATA_MODE`, which is one of:

| Mode | When | Progress target | Writes allowed |
|---|---|---|---|
| `live` | `VITE_DATA_MODE=live` **and** `location.hostname` ends with `.github.io` | data repo, `progress.json` (root) | data repo, any path **not** under `dev/` |
| `dev` | default for `npm run dev`, and any `live` build served from a host other than `*.github.io` (for example `npm run preview`) | data repo, `dev/progress.json` (forced, not editable) | data repo, only paths under `dev/` |
| `local` | `VITE_DATA_MODE=local` | none. localStorage only | none |

Rules:
- `.env.development` contains `VITE_DATA_MODE=dev`. `.env.production` contains `VITE_DATA_MODE=live`.
- The live check needs **both** conditions. A production build opened on `localhost` silently becomes `dev`.
- `dataPath(rel)` in `dataMode.js` maps a logical path to the real one: live → `rel`, dev → `dev/${rel}`. Every data read and write goes through it, so no other module knows about `dev/`.
- localStorage keys are namespaced by mode: live keeps today's keys (`tocfl.settings`, `tocfl.progress`, `tocfl.studyFilter`). Dev and local use `tocfl.dev.*` and `tocfl.local.*`. Your phone's live data in localStorage is never touched by a dev build, even on the same origin.
- A banner is always visible outside live mode: amber `DEV DATA · Chinese-Study-Data/dev/progress.json` or grey `LOCAL ONLY · not synced`.
- **Cutover:** until the first v2 merge, the old live app keeps writing `progress.json` in the app repo. At the first merge (WORKFLOW §8) you copy that file into the data repo root, and from then on the app repo copy is retired (removed in the same merge; it stays in public git history, see RISKS).

### 3.2 The write guard

Every GitHub write function in `src/lib/github.js` (`saveProgress`, `putTextFile`, `uploadFile`, `createFolder`, `deleteFile`) calls `assertWriteAllowed({ owner, repo, path })` from `dataMode.js` before any network call:

```js
// throws Error('Blocked write: …') — never returns false
if (DATA_MODE === 'local') throw …
if (`${owner}/${repo}` !== DATA_REPO_FULL_NAME_FROM_SETTINGS) throw …   // never the app repo
if (DATA_MODE === 'dev'  && !path.startsWith('dev/')) throw …
if (DATA_MODE === 'live' &&  path.startsWith('dev/')) throw …
if (`${owner}/${repo}` === APP_REPO) throw …                             // constant 'shanesilverman0-bot/Chinese-Study-Tool'
```

The guard is a single function with no options. No phase may add a bypass.

### 3.3 Settings for the data repo
Per device (§15.2): `data.owner` (default `shanesilverman0-bot`), `data.repo` (default `Chinese-Study-Data`), `data.branch` (fixed `main`), token. The old `github.branch`/`github.path` settings are ignored after Phase 1A (kept in storage, not shown). Runtime vocab packs other than the 6 bundled CCC packs are read from the data repo's `vocab/` folder.

### 3.4 Debug handle

In `dev` and `local` modes only, `window.__tt` exposes `{ progress, migrate, mergeProgress, counts, items, dataMode }` for console checks. Phases add fields to it. It is not created in `live` mode.

## 4. Item model

### 4.1 Keys

```
word key     = `${hanzi}|${pinyin}`     e.g. "遺憾|yíhàn"   (main sense; unchanged, so every existing card keeps its key)
extra sense  = `${hanzi}|${pinyin}#${POS}`  e.g. "筆|bǐ#M"   (a second TOCFL sense of the same hanzi+pinyin, §4.4)
grammar key  = `g:${slug}`              e.g. "g:lian-dou"    (reserved; no grammar items exist yet)
```
`itemTypeOf(key)` returns `'grammar'` if the key starts with `g:`, otherwise `'word'`. Word keys always contain `|`. Grammar keys never do. **Never build a key by hand** from `hanzi` and `pinyin`: always use `item.key` (or `cardKey(v)`, which returns `v.key` when present).

### 4.2 Item record (runtime, built by `buildItemIndex()` in `src/lib/items.js`)

```ts
type Item = {
  key: string
  type: 'word' | 'grammar'
  // word fields
  hanzi?: string
  pinyin?: string
  english: string           // the gloss for THIS sense (§4.4); for outside-TOCFL Pleco words, trimmed Pleco gloss
  glossSource?: 'override'|'ccc'|'cedict-pos'|'cedict'   // where english came from (§4.4)
  level: 'Novice'|'A1'|'A2'|'B1'|'B2'|'C'|null   // TOCFL level of this sense (source ID prefix L0…L5); null if not TOCFL
  band: 'Novice'|'A'|'B'|'C'|null   // derived from level (A1/A2 → A, B1/B2 → B); kept for older code
  pos?: string              // part of speech from the source list (TOCFL or CCC), e.g. 'N', 'M', 'Vs', 'M/Prep/V'
  senseOf?: string          // for an extra sense: the main sense's key ("筆|bǐ"); absent on main senses
  senses?: string[]         // on a main sense: keys of its extra senses
  variants?: { hanzi: string, pinyin: string }[]   // other written forms of this entry (她 for 他/她, 相片 for 照片)
  tocflId?: string          // source row ID, e.g. 'L0-1083'
  inTocfl: boolean          // key is a TOCFL key
  tocflKey: string|null     // the TOCFL key this item counts as (itself, or the match for a CCC/Pleco key), see 4.3
  ccc: {book:number, chapter:number, part:string}[]
  sources: ('tocfl'|'ccc'|'pleco'|'custom'|'grammar')[]
  tags: string[]            // e.g. 'outside-TOCFL'
  // grammar fields (deferred, defined now)
  pattern?: string          // "連…都…"
  level?: string            // TOCFL level label
  examples?: string[]
}
```

Built from: `SEED_VOCAB` (one entry per TOCFL sense, already built by `scripts/build-vocab.mjs`, §4.4), bundled CCC packs (every row kept), `progress.customItems`, and later a grammar dataset.

### 4.3 Matching a (hanzi, pinyin) pair to a TOCFL key

`matchToTocfl(hanzi, pinyin)` in `src/lib/items.js` tries these tiers in order and returns `{ status, key, candidates }`:

1. `exact`: `hanzi|pinyin` is a TOCFL key.
2. `normalized`: equal after `normPinyin()` on both sides (NFC, lowercase, remove spaces, `'`, `’`, `-`, `·`).
3. `variant`: the TOCFL pinyin contains `/` (e.g. `照片|zhàopiàn/xiàngpiàn/xiàngpiànr`, `爸爸|bàba/bà`) and one of its `/`-separated parts matches under tier 2.
4. `hanzi-unique`: no pinyin match, but the hanzi has exactly one TOCFL key (e.g. CCC `這|zhèi` → `這|zhè`).
5. `ambiguous`: the hanzi has 2+ TOCFL keys and no pinyin match. `candidates` lists them.
6. `none`: the hanzi is not in TOCFL.

Variant forms count as hanzi here: `她|tā` matches `他|tā` through its `variants` at tier 1. After a word is matched, **pick the sense** with `pickSense(mainKey, pos)`: the sense whose `pos` equals the given POS, or contains it in a `/` list (`M/Prep/V` contains `Prep`). If none fits, use the main sense. CCC rows pass their own `pos`, so 筆 in Book 4 (M) maps to `筆|bǐ#M` and 筆 in Book 2 (N) maps to `筆|bǐ`.

How each consumer uses the tiers:
- **Baseline and counting** (CCC words → TOCFL): tiers 1–4 are accepted. 5–6 are excluded.
- **Pleco import**: tiers 1–3 are accepted automatically. Tier 4 and tier 5 go to the resolve screen. Tier 6 becomes an `outside-TOCFL` custom item.

Measured on books 1–3 (2,074 rows): exact 1,410, normalized 27, hanzi-unique 84, ambiguous 2, none 551.

### 4.4 Word data: senses, variants, levels (built by Phase 2.5)

**Why.** The original converter kept one English gloss per hanzi+pinyin and dropped POS, variant characters and the A1/A2, B1/B2 split. It also deduplicated CCC rows. As a result, 筆 showed "sum (of money)" (the Book 4 measure word overwrote the Book 2 "pen"). Both TOCFL senses of 筆 also shared one card, 她 vanished, and 對 "to" dropped out of B1 Ch 13.

**Sources (in the app repo, `data-src/`):**
- `tocfl-cedict.csv`: 7,517 TOCFL rows: `ID` (`L0`…`L5` prefix = level), `Traditional` (`/` separates variant forms), `Pinyin` (`/` separates the variants' readings), `POS`, `Variants` (JSON list of `{Traditional, Pinyin}`), and `Meaning` (CC-CEDICT, senses separated by `/`, variants by `<br>`).
- `dangdai-expanded.csv`: 4,989 CCC rows: `ID` (`B1L10-I-11` = book, lesson, part, number), `Traditional`, `Pinyin`, `POS`, `Meaning`, `Tags` (`Name`, `Character Name`).
- `gloss-overrides.csv` (new, starts empty, header `key,english`): your corrections. They always win.

**Levels.** `L0` Novice (準備, 394 rows), `L1` A1 (入門, 347), `L2` A2 (基礎, 485), `L3` B1 (進階, 1,173), `L4` B2 (高階, 2,342), `L5` C (流利, 2,776).

**Senses (TOCFL).** Group rows by `(first Traditional form, full Pinyin string)` (so existing keys don't change):
- The **main sense** is the row with the lowest level (ties: lowest ID). Its key is `hanzi|pinyin`.
- Every other row with a **different POS** becomes an **extra sense** with key `hanzi|pinyin#POS` (a second extra sense with the same POS gets `#POS-2`).
- A row with the **same POS** as the main sense is a true duplicate: it is merged into the main sense (it keeps the lowest level and records the others in `levels`).

Measured: 7,517 rows → 283 keys appear 2+ times; 273 become extra senses, 10 are true duplicates. That gives about **7,488 senses**.

**Variants.** The first `Traditional` form is the display and key form. The others go in `variants` with their pinyin from the `Variants` column (`他/她` → key `他|tā`, variant `她|tā`; `照片/相片/相片兒` → variants `相片|xiàngpiàn`, `相片兒|xiàngpiànr`). Following TOCFL, an entry with variants counts as **one** word. The card shows all forms: 他／她.

**Gloss per sense (`english`, first match wins):**
1. `override`: a row in `gloss-overrides.csv` for this key.
2. `ccc`: a CCC row with the same hanzi (or a variant), the same normalized pinyin, and a matching POS (§4.3 `pickSense` rule). Use its `Meaning`.
3. `cedict-pos`: take this variant's `Meaning` segment (split on `<br>`, pick the one starting with this hanzi), then split it into senses on `/`. For `M` senses, keep senses starting with `classifier`, `CL:` or `measure word`. For other POS, drop those classifier senses and `CL:…` notes. Keep the first 3, joined with `; `.
4. `cedict`: the first 3 senses of this variant's segment, unfiltered.

**Review list.** The build writes `data-src/gloss-review.csv` (`key, level, pos, english, glossSource, otherSenses`). It lists every extra sense, plus every main sense that has extra senses, whose `glossSource` isn't `override` or `ccc` (expect ≈ 250 rows). You fix what's wrong by adding rows to `gloss-overrides.csv` and re-running the build.

**CCC rows.** All 4,960 non-`Character Name` rows are kept. **No per-book dedupe.** Each row gets `id` (from `ID`), `book`, `lesson`, `part`, `pos`, `english`, `tags`. Rows tagged `Name` are kept in lists but tagged `name`, and never count. The CCC row's own `english` is shown on lists and, when you study from a CCC list, under the card's gloss as "In this lesson: …".

**Front of the card.** Hanzi + pinyin alone can't tell two senses apart. When an item has extra senses (or is one), the front shows a small POS chip under the hanzi (`名`/`N`, `量`/`M`, …, from a constant map), e.g. 筆 `量 M`.

**Outputs.**
- `src/data/vocab.js`: same exports (`BANDS`, `BAND_LABELS`, `SEED_VOCAB`, `vocab`), plus `LEVELS` and `LEVEL_LABELS`. One entry per sense with `key, hanzi, pinyin, english, glossSource, level, band, pos, senseOf?, senses?, variants?, tocflId, tones`. `tones` = the tone numbers read from the tone marks of the key's first pinyin reading, in order (unmarked neutral-tone syllables are skipped). That's better than the old arrays (RISKS B16); Phase 16 may refine it.
- `vocab/cccc-book{1..6}.json`: same file shape as today, all rows, with the added fields.
- Both are generated. Never edit them by hand. Re-run `node scripts/build-vocab.mjs`.

**Existing progress.** No migration is needed. Every existing card key is still the key of a main sense. For your 29 reviewed multi-sense words, the history stays on the main sense (筆 = pen, 對 = correct, 家 = home). The extra senses start as new cards.

## 5. progress.json schema v3

Top level. **Bold** = new in v3. Every field not listed is preserved untouched.

```ts
{
  schemaVersion: 3,                 // NEW. Missing = legacy (treated as 2)
  version: 1 | 2,                   // legacy field, kept as-is, never read
  updatedAt: string,                // ISO, set on every save
  cards: { [itemKey]: Card },
  log: ReviewLogEntry[],            // FSRS review log: entries newer than the archive watermark. No cap (§7, §8.5)
  logArchive: LogArchive,           // NEW. which months were moved to log/YYYY-MM.json
  migrations: MigrationRecord[],
  studySettings: StudySettings,
  goals: Goal[],
  snapshots: Snapshot[],
  lists: { [listId]: List },        // stored lists only (pleco, custom). CCC lists are virtual (§9)
  customItems: { [itemKey]: CustomItem },
  itemNotes: { [itemKey]: ItemNote },
  exerciseFiles: { [fileId]: ExerciseFileMeta },
  exerciseFlags: { [questionRef]: QuestionFlag },
  attempts: Attempt[],              // context attempt log, raw, capped (§11.4)
  contextArchive: ContextArchive,   // rolled-up older attempts
  testRuns: TestRun[],
  sessions: StudySession[],
  manualEntries: ManualEntry[],
  sentences: SentenceEntry[],
  grammar: {}                       // reserved, empty object (§16)
}
```

### 5.1 Card (existing, one optional field added)

```ts
type Card = {
  hanzi: string, pinyin: string,       // existing (legacy id-keyed cards may have vocabId instead)
  due: string, stability: number, difficulty: number,
  elapsed_days: number, scheduled_days: number,
  reps: number, lapses: number, state: 0|1|2|3, last_review?: string,
  firstSeen?: string | null            // NEW. ISO of the first rating. Set by migration (from log, else last_review) and by rate() when reps goes 0 → 1
}
```
Cards exist **only for items you have rated** (no stubs). A card is created by `rate()` with `newCardState()` the first time you rate an item. "Seen" still means `reps > 0`, so a card restored from an old backup with `reps === 0` doesn't count.

### 5.2 ReviewLogEntry (unchanged)
`{ key, hanzi, pinyin, rating: 'again'|'hard'|'good'|'easy', at }`. One entry is written per flashcard rating. It has no separate id field; the pair `key + at` (word + exact millisecond) is unique in practice and serves as its id. Merge dedupes by it.

### 5.2a LogArchive (NEW)
```ts
{ watermark: string | null,   // ISO; every log entry with at <= watermark lives in an archive file, not in progress.log
  months: string[] }          // 'YYYY-MM' of each archive file written, sorted
```
Archive file `dataPath('log/YYYY-MM.json')` = `{ format: 'tocfl-tutor.review-log', month, entries: ReviewLogEntry[] }`, entries sorted by `at`.

### 5.3 MigrationRecord
```ts
{ from: number, to: number, at: string, backupPath: string | null, device: string }  // device = navigator.userAgent first 60 chars
```

### 5.4 StudySettings (synced, see §15)
```ts
{
  updatedAt: string,
  knownThreshold: number,              // days; must be one of THRESHOLD_EDGES. Default 3
  knownRequiresReviewState: boolean,   // default TRUE (2026-10-29). A card must also have graduated (state === 2, Review). See §8.4
  baseline: {
    enabled: boolean,                  // default true
    solidThrough: { book, chapter },   // CCC chapters up to and including this count as Known until you rate them. Default {book:3, chapter:9}
    studiedThrough: { book, chapter }  // chapters after solidThrough up to and including this are "studied, needs review":
                                       // they count as Seen but NOT Known until FSRS says so. Default {book:4, chapter:4}
  },
  courseHistory: {                     // for the estimated history curve (§8.5). Confirmed by Shane 2026-10-29
    start: { date: 'YYYY-MM-DD', book, chapter },   // default { date:'2025-09-01', book:1, chapter:3 }
    end:   { date: 'YYYY-MM-DD', book, chapter }    // default { date:'2026-08-19', book:4, chapter:4 }
  } | null,
  contextRule: {                       // all editable in Settings → Counting; meanings in §11.5
    minCorrect: number,                // default 2
    minDistinctExercises: number,      // default 2
    requireDistinctTypes: boolean,     // default false
    minRecentAccuracy: number,         // default 0.75 (0–1)
    recentWindow: number,              // default 10 attempts
    sentencesCount: boolean,           // default true (RISKS Q9): graded sentences count as attempts
    approved: boolean                  // default TRUE (approved 2026-10-29)
  },
  understanding: {                     // per-word 0–max depth score shown on cards and lists (§11.5)
    max: number,                       // default 10
    points: { cloze: 1, fill: 1, usage: 1, listening: 1, sentence: 1, sentenceNaturalBonus: 0 }
  },
  timeZone: string,                    // default 'Asia/Taipei'. All YYYY-MM-DD dates use this zone
  selectedGoalId: string | null,
  attemptLogMax: number,               // default 3000
  logKeepDays: number                  // default 90: review-log entries older than this move to archive files
}
THRESHOLD_EDGES = [1, 2, 3, 4, 5, 7, 10, 14, 21, 30, 45, 60, 90, 180]   // constant in src/lib/counts.js
```
Session size is **not** a synced setting any more: you choose it each time in the study picker (§9.4).

### 5.5 Goal
```ts
{
  id: string, label: string,
  metric: 'known',                     // only Known gets goals/pace
  startDate: 'YYYY-MM-DD',
  startValue: number | null,           // null = use the Known value on startDate (snapshot, else live baseline-only estimate)
  endDate: 'YYYY-MM-DD',               // used when examId is null
  examId: string | null,               // NEW: an id from EXAM_DATES; when set, endDate is taken from it
  target: number,
  enabled: boolean,
  updatedAt: string, deleted?: boolean
}
```
`EXAM_DATES` is a constant in `src/data/exams.js`, copied from the official SC-TOP Taiwan schedules (2026 and 2027 PDFs, tocfl.edu.tw). Each entry: `{ id, date /* first day */, days, kind: 'LR'|'speaking'|'writing'|'pilot', bands, registration: [from, to], scoresOn }`. Listening & Reading (computer-adaptive, NT$2,000):

| id | Test date | Registration | Scores |
|---|---|---|---|
| `lr-2026-11` | 2026-11-14/15 | closed (Oct 5–20) | 2026-12-04 |
| `lr-2026-12` | 2026-12-12/13 | 2026-11-02 – 11-17 | 2027-01-04 |
| `lr-2027-01` | 2027-01-09/10 | 2026-11-30 – 12-11 | 2027-01-29 |
| `lr-2027-03` | 2027-03-06/07 | 2027-01-18 – 01-29 | 2027-03-26 |
| `lr-2027-05` | 2027-05-15/16 | 2027-04-05 – 04-16 | 2027-06-04 |
| `lr-2027-06` | 2027-06-26/27 | 2027-05-17 – 05-28 | 2027-07-16 |
| `lr-2027-08` | 2027-08-07/08 | 2027-06-28 – 07-09 | 2027-08-27 |
| `lr-2027-11` | 2027-11-06/07 | 2027-09-27 – 10-08 | 2027-11-26 |
| `lr-2027-12` | 2027-12-18/19 | 2027-11-08 – 11-19 | 2028-01-11 |

Also listed (not goal defaults): Speaking/Writing Band B on 2026-11-15, 2027-03-07, 2027-11-07; Band C speaking/writing 2027-05-16; pilot Listening & Reading tests (NT$200) 2027-04-17 and 2027-10-16. The dashboard has an exam selector (§8.6) that sets `examId` on the selected goal.

Defaults written by migration (editable):
```json
[
 {"id":"goal-exam","label":"TOCFL exam","metric":"known","startDate":"2026-11-01","startValue":null,"endDate":"2027-05-15","examId":"lr-2027-05","target":5000,"enabled":true},
 {"id":"goal-jun-2027","label":"June 2027","metric":"known","startDate":"2027-05-17","startValue":null,"endDate":"2027-06-30","examId":null,"target":5500,"enabled":false},
 {"id":"goal-dec-2027","label":"Jul–Dec 2027","metric":"known","startDate":"2027-07-01","startValue":null,"endDate":"2027-12-31","examId":null,"target":6500,"enabled":false}
]
```
The default exam (`lr-2027-05`, May 15–16 2027) was confirmed by Shane on 2026-10-29. Others are one tap away on the dashboard. The June and Jul–Dec targets are placeholders, so those goals start disabled.

### 5.6 Snapshot (one per local date)
```ts
{
  date: 'YYYY-MM-DD',                  // local date in studySettings.timeZone; unique
  computedAt: string,
  seen: number, known: number, context: number,          // values under params
  params: { knownThreshold: number, knownRequiresReviewState: boolean,
            baselineEnabled: boolean, solidThrough: {book, chapter}, studiedThrough: {book, chapter},
            contextRuleKey: string },  // contextRuleKey = JSON of contextRule minus approved
  raw: {
    reviewedTocfl: number,             // TOCFL items with an effective card with reps>0
    tails: { [edge: string]: number }, // for each THRESHOLD_EDGE: reviewed TOCFL items with stability > edge
    tailsReviewState: { [edge: string]: number }, // same, counting only state === 2
    baselineUntouched: number,         // solid-baseline TOCFL items with no reps (count as Seen + Known)
    studiedUntouched: number,          // studied-tier TOCFL items with no reps (count as Seen only)
    contextQualified: number           // same as context
  },
  source: 'live' | 'backfill' | 'estimate' | 'recomputed'   // 'estimate' = course-history curve (§8.5)
}
```
Kept forever, about 300 bytes a day.

### 5.7 List (stored for `pleco` and `custom` only)
```ts
{
  id: string,                          // 'pleco:<category>' | 'custom:<newId>'
  name: string,
  sourceType: 'ccc' | 'pleco' | 'custom',
  source: { book, chapter } | { category, importedAt, fileName } | {},
  itemKeys: string[],                  // ordered; words or (later) grammar keys
  createdAt: string, updatedAt: string, deleted?: boolean
}
```
Exercise files and test scores are **not** stored on the list. They are derived: files from `exerciseFiles[*].listId`, scores from `testRuns`. One source of truth, no sync conflicts.

### 5.8 CustomItem (words not in the dataset, e.g. Pleco outside-TOCFL)
```ts
{ key, type: 'word', hanzi, pinyin, english, band: null, tags: ['outside-TOCFL'], source: 'pleco'|'custom', createdAt, updatedAt }
```

### 5.9 ItemNote
```ts
{ pleco?: { defn: string /* ≤ 400 chars */, dictref: string /* 'PACE:33411328' */, categories: string[] }, updatedAt }
```

### 5.10 ExerciseFileMeta (contents live in the repo, §10.5)
```ts
{
  id: string,                          // `${listSlug}.b${batch}.v${variant}.${shortHash}`
  listId: string, batch: number, variant: number,
  itemType: 'word' | 'grammar',
  path: string,                        // 'exercises/<listSlug>/<id>.json' on the data branch
  importedAt: string, generator: string | null,
  counts: { exercises: number, questions: number, rejected: number },
  targets: string[],                   // item keys covered
  reviewed: boolean,                   // a verify-pass review file was imported
  updatedAt: string, deleted?: boolean
}
```

### 5.11 QuestionFlag
`questionRef = ${fileId}#${exerciseId}#${qIndex}`
```ts
{ status: 'disabled' | 'warning', reason: string, from: 'verify-pass' | 'user', at: string }
```
Disabled questions are skipped in practice and tests.

### 5.12 Attempt (context log)
```ts
{
  id: string,                          // newId('a')
  at: string,
  fileId: string, exId: string, q: number,
  key: string,                         // target item key
  type: 'cloze'|'fill'|'usage'|'listening'|'sentence'|'pattern-cloze'|'grammar-usage'|'error-spot',
                                       // 'sentence' = a graded sentence (fileId = 'sentences', exId = SentenceEntry id)
  mode: 'practice' | 'test',
  runId: string | null,                // TestRun id when mode = 'test'
  correct: boolean,
  chosen: string,                      // option text chosen
  ms: number                           // time on question
}
```

### 5.13 ContextArchive
```ts
{
  watermark: string | null,            // ISO; every attempt with at <= watermark is archived
  items: { [itemKey]: { n: number, c: number,
                        byType: { [type]: [n: number, c: number] },
                        exCorrect: string[] /* distinct `${fileId}#${exId}` answered correctly, max 10 */ } }
}
```

### 5.14 TestRun
```ts
{
  id: string, listId: string, variant: number,
  fileIds: string[], questionCount: number,
  startedAt: string, finishedAt: string | null,
  correct: number, total: number,      // total = answered
  status: 'in-progress' | 'finished' | 'abandoned',
  updatedAt: string
}
```
Latest score for (list, variant) = the most recent `finished` run. The full history stays in `testRuns`, which is never capped (about 200 bytes per run).

### 5.15 StudySession
```ts
{
  id: string, start: string, end: string, durationSec: number,
  activities: ('flashcards'|'cloze'|'fill'|'usage'|'listening'|'test'|'sentences'|'tone')[],
  listIds: string[],
  counts: { reviews: number, attempts: number },
  source: 'timer', updatedAt: string, deleted?: boolean
}
```

### 5.16 ManualEntry
```ts
{
  id: string, date: 'YYYY-MM-DD', durationMin: number,
  practiceType: 'listening'|'reading'|'writing'|'speaking'|'vocabulary'|'grammar'|'other',
  practiceTypeOther: string,           // used when 'other'
  material: string,                    // chosen preset or free text
  notes: string,
  extra: { [k: string]: string },      // extension point; UI ignores unknown keys
  createdAt: string, updatedAt: string, deleted?: boolean
}
```
Preset materials (constant, editable in code): `當代中文課程`, `TOCFL 模擬考`, `Podcast`, `YouTube`, `新聞`, `小說/書`, `語言交換`, `家教`, `Other…`.

### 5.17 SentenceEntry
```ts
{
  id: string, key: string, sentence: string, at: string,
  status: 'queued' | 'exported' | 'graded',
  exportedAt: string | null,
  grade: { correct: boolean, natural: boolean, corrected: string, note: string, gradedAt: string } | null,
  updatedAt: string, deleted?: boolean
}
```

### 5.18 Size budget
Today the file is 2.68 MB pretty-printed and 1.69 MB compact. 1.59 MB of that is 9,132 unreviewed stub cards. v3 changes:
- Save compact JSON (`JSON.stringify(data)`, no indentation). Same data, about 37% smaller. Phase 2.
- Raw `attempts` capped at `attemptLogMax` (≈ 270 KB at 3,000).
- Stub cards are removed by the v3 migration (approved, RISKS Q5): about 1.6 MB, roughly 60% of the file. After v3 the file is about 0.1 MB.
- Old review-log entries move to monthly archive files (§8.5), so `log` stays around 90 days.

## 6. Migration plan

### 6.1 `migrate(p, { now, device })` in `src/lib/migrate.js`
A pure function with no React and no browser APIs, so Node can import it (`scripts/check-migration.mjs`).

```
if p is null/not an object      → return freshV3()
if p.schemaVersion > 3          → throw new Error('progress.json is from a newer app version (schemaVersion X). Reload the app.')
if p.schemaVersion === 3        → return ensureV3Shape(p)       // fills missing collections only; never overwrites
from = p.schemaVersion ?? 2
out = shallow copy of p (all unknown keys kept)
out.schemaVersion = 3
loggedKeys = set of entry.key in p.log
out.cards = {}
for each [key, card] of p.cards:
   if isStub(card, key, loggedKeys): continue           // removed (approved exception, §1)
   copy = { ...card }
   if copy.reps > 0 and copy.firstSeen === undefined:
       copy.firstSeen = earliest log entry .at with entry.key === key ?? copy.last_review ?? null
   out.cards[key] = copy
isStub(c, key, logged) = (c.reps ?? 0) === 0 && !c.last_review && (c.lapses ?? 0) === 0 && !logged.has(key)
add missing: logArchive {watermark:null, months:[]}, migrations [], studySettings DEFAULTS, goals DEFAULT_GOALS, snapshots [], lists {}, customItems {},
             itemNotes {}, exerciseFiles {}, exerciseFlags {}, attempts [], contextArchive {watermark:null, items:{}},
             testRuns [], sessions [], manualEntries [], sentences [], grammar {}
out.migrations.push({ from, to: 3, at: now, backupPath: null, device, removedStubs: <count> })
return out
```
Invariants, all asserted by `scripts/check-migration.mjs`:
1. Idempotent: `deepEqual(migrate(migrate(x)), migrate(x))`. The second call takes the `schemaVersion === 3` branch and appends no second migration record.
2. Every input card that is **not** a stub is present in the output with identical fields except for an added `firstSeen`. Every removed card satisfies `isStub`. `removedStubs` equals the number removed (expected ≈ 9,132 on the 2026-10-27 data, including the 62 unreviewed legacy id-keyed cards).
3. `log.length` is unchanged. Every input top-level key is still present.
4. Every card with `reps > 0` is kept, byte-for-byte except `firstSeen`.

`reconcile()` in `useProgress.js` runs **after** `migrate()` on every load and pull. From Phase 1B it **no longer creates stub cards**; it only re-attaches `hanzi`/`pinyin` to existing cards. Every consumer treats a missing card as "new" (`newCardState()`).

### 6.2 Backup before the first v3 write
The first save to a target whose remote file has `schemaVersion` < 3 (or missing) does this:
1. Write the remote file's raw text unchanged to `dataPath('backups/progress-pre-v3-<YYYYMMDD-HHmmss>.json')` in the data repo (dev: `dev/backups/…`), using `putTextFile` (guarded). This backup still contains the stub cards that the migration removes.
2. Only if that succeeds, set `migrations[last].backupPath` and save the merged v3 file.
3. If the backup write fails, the sync dot turns red with "Backup failed — not saving", and nothing is saved. The next save retries.

Also always available: Settings → Data → "Download progress.json" (current in-memory, migrated) and "Restore from file…" (§15.3). Git history is the third safety net: every save is a commit.

### 6.3 Future migrations
Add `migrateV3toV4` and chain them. Bump `CURRENT_SCHEMA` in `src/lib/schema.js`. Each step must keep the invariants in 6.1 and get its own backup (`backups/progress-pre-v4-…`).

### 6.4 Old clients
The current `main` code preserves unknown top-level fields, because it spreads the parsed object. But it is last-writer-wins and does not know `firstSeen`. After merging v2, open the app on every device and reload once (WORKFLOW §8). New code refuses to save over a file whose `schemaVersion` is higher than it knows.

## 7. Sync: merge-on-save

`mergeProgress(local, remote)` in `src/lib/merge.js` (pure). Save flow in `useProgress`:

```
debounce 4 s after the last change (and flush on visibilitychange → hidden)
→ fetch remote {data, sha}
→ remote = migrate(remote)
→ merged = mergeProgress(localState, remote)
→ rollupAttempts(merged)            // §11.4
→ archiveLog(merged)                // §8.5: may first write log/YYYY-MM.json files (guarded), then advances the watermark
→ backup if needed (§6.2)
→ PUT merged with sha (compact JSON)
→ on 409 or 422: refetch and re-merge, max 3 tries, then show the error
→ setProgress(merged)               // so this device sees the other device's work
```

Merge rules:
| Collection | Rule |
|---|---|
| `cards` | Per key: keep the record with the later `last_review` (missing = oldest). Tie → higher `reps`. `firstSeen` = the earliest non-null of the two. Then drop stubs (`isStub` from §6.1), so an old app version that re-creates stubs can't bring them back |
| `log` | Union, dedupe by `key + at`, sort by `at`. **No cap.** Then drop entries with `at <= max(local.logArchive.watermark, remote.logArchive.watermark)` |
| `logArchive` | `watermark` = the later of the two; `months` = union, sorted |
| `snapshots` | Per `date`: later `computedAt` |
| `studySettings` | Whole object: later `updatedAt` |
| `goals`, `lists`, `customItems`, `itemNotes`, `exerciseFiles`, `sessions`, `manualEntries`, `sentences`, `testRuns` | Per id/key: later `updatedAt`. Tombstones win if newer |
| `exerciseFlags` | Per ref: later `at` |
| `attempts` | Union by `id`. Then drop any with `at <= max(local.watermark, remote.watermark)` (already archived) |
| `contextArchive` | Take the archive whose watermark is later. If equal, take local |
| `migrations` | Union by `from + to + at` |
| `schemaVersion` | max. Unknown top-level keys: union, remote wins on conflict |

Known limitation: attempts older than the archive watermark that arrive late from an offline device are dropped. Rollup only archives attempts older than 60 days, so this needs a device offline for 60+ days.

## 8. Counting

All counting lives in `src/lib/counts.js` (pure). Inputs: `progress`, `itemIndex`, `baselineSet`, `studySettings`, `now`.

### 8.1 Universe
Only TOCFL items count: the ≈ 7,488 TOCFL senses (§4.4). CCC and Pleco cards count **through** their `tocflKey` (§4.3). The **effective card** of a TOCFL key is whichever of {its own card, every card whose item maps to it} has the highest stability. Its `firstSeen` is the earliest of them. Outside-TOCFL items never count.

### 8.2 Baseline (two tiers)
Your CCC course position is the measure of what you have studied, but the most recent chapters aren't solid yet. So the baseline has two tiers, both computed from bundled CCC entries matched to TOCFL keys (tiers 1–4 of §4.3), each key assigned to the **first** CCC chapter where it appears:

| Tier | Chapters (defaults) | TOCFL keys (measured 2026-10-29 on the old data; Phase 2.5 re-measures on senses) | Counts as |
|---|---|---|---|
| `solid` | Book 1 Ch 1 → `solidThrough` (B3 Ch 9) | **1,268** | Seen **and** Known, until you rate it |
| `studied` | after `solidThrough` → `studiedThrough` (B3 Ch 10 → B4 Ch 4) | **325** | Seen only. Known only once FSRS says so |

`baselineSets(index, cccEntries, settings.baseline)` → `{ solid: Set, studied: Set }`. Chapter comparison is lexicographic on `(book, chapter)`.

A baseline key is **untouched** when it has no card (or `reps === 0`). Untouched baseline words:
- solid: count toward Seen and Known; studied: count toward Seen only;
- never count toward Context;
- **solid** untouched words are excluded from the flashcard queue by default (a picker switch "Include baseline words" lets you check them, §9.4). **Studied**-tier words are always included: they are what you're reviewing now.

Once a baseline word has `reps > 0`, the normal rule applies: its stability and state decide Known. If you press Again on a solid baseline word, it leaves the baseline and has to earn Known again. It is not sticky: once it climbs back, it is Known again through the normal rule.

### 8.3 Definitions
```
isKnownCard(c)   = c.reps > 0 && c.stability > T && (!requireReview || c.state === 2)
Seen   = |{k ∈ TOCFL : eff(k).reps > 0}| + |untouched solid| + |untouched studied|
Known  = |{k ∈ TOCFL : isKnownCard(eff(k))}| + |untouched solid|
Context= |{k ∈ TOCFL : contextQualified(k)}|     (§11.5)
```

### 8.4 Known, learning steps and "graduation"
With ts-fsrs 4.7.1 default weights, the first rating of a new card gives stability Again 0.40, Hard 1.18, **Good 3.17**, Easy 15.69 days. FSRS also tracks a card **state**: New (0) → Learning (1) → Review (2), and Relearning (3) after a lapse. Again/Hard/Good on a new card put it in **Learning**: a short same-session re-show (minutes). Rating it again when it comes back moves it to **Review**: it has *graduated*. **Easy** on a new card graduates it immediately with a ~16-day interval. That is the button for a word that is too easy.

Rule (2026-10-29): **Known = stability > 3 days AND graduated (Review state).** One lucky Good isn't enough; you must recall it again later in the session (or press Easy). Today's data: 187 reviewed cards are above 3 days, but only 90 have graduated. The other ~165 are stuck in Learning because the current queue never re-shows learning cards in the same session. §9.4 fixes that, so the gap closes as you study.

### 8.5 Snapshots, review-log archive, history
- `upsertTodaySnapshot()` runs: (a) once after the app's data is ready (migrated, packs bundled, first pull finished or failed), (b) when a study session ends, (c) on `visibilitychange → hidden`, at most once per 10 minutes. It overwrites only today's entry.
- Past snapshots are never rewritten except by "Recompute history" (Settings → Counting), which rewrites `seen/known/context/params` and sets `source:'recomputed'`. It reads stored `raw.tails`/`raw.tailsReviewState` for the new threshold (exact, because thresholds are restricted to `THRESHOLD_EDGES`). It recomputes the baseline part exactly from cards' `firstSeen`. Context keeps its stored value.
- **Review-log archive** (`archiveLog`, Phase 6): log entries older than `logKeepDays` (90) move to `log/YYYY-MM.json` in the data repo: read the month file if it exists, union by `key + at`, write it (guarded), and only after **every** write succeeds advance `logArchive.watermark` and remove those entries from `progress.log`. On any failure nothing is removed. Nothing is ever dropped. At your pace (up to ~270 ratings a day) the old 5,000 cap would have started deleting history within a few weeks.
- **FSRS backfill** (Phase 6) replays the full log (archive files + `log`) to produce `tails` for each past day since the first entry (2026-06-22).
- **Course estimate** (Phase 6, needs `courseHistory`): for dates between `courseHistory.start.date` and `end.date`, each CCC chapter gets an estimated completion date by spreading the chapters evenly across the period. Chapters before `start` (B1 Ch 1–2 by default) count as already completed on the start date. Defaults: 2025-09-01 at B1 Ch 3 → 2026-08-19 having finished B4 Ch 4 (46 chapters in ~50 weeks). For each week in that span an `estimate` snapshot is written: Seen = TOCFL keys first met in chapters completed by that date; Known = the solid-tier part of that. From 2026-06-22 on, the FSRS replay adds rated words. The chart draws `estimate` points with a dashed line and the label "estimated from course".

### 8.6 Goal lines, exam selector, pace
- A goal line is a straight segment from `(startDate, startValue ?? Known on startDate)` to `(endDate, target)`, where `endDate` comes from `EXAM_DATES[examId]` when `examId` is set. If `startDate` is before the first snapshot, use the first snapshot's Known.
- **Exam selector** on the dashboard: a dropdown of upcoming Listening & Reading dates from `EXAM_DATES` (with registration window and "registration open/closed" shown). Choosing one sets `examId` on the selected goal. The goal line, pace box and "days left" update immediately.
- The pace box uses `selectedGoalId` (default: the enabled goal with the nearest future end date):
  - `needed/week = max(0, target − knownToday) / max(1/7, daysLeft/7)`
  - `actual/week` = (knownToday − Known at the latest snapshot on or before today−28) / 4. If history covers less than 28 days, use the available span `s` days: `(knownToday − knownFirst) / (s/7)`, and label it "based on s days". Fewer than 3 days → show "—".
  - `gap = needed − actual` (positive = behind, shown in cinnabar; negative = ahead, shown in jade).
- Pace is for Known only. Context has no pace or goals.

## 9. Lists

### 9.1 Kinds
| sourceType | id | Items | Stored? |
|---|---|---|---|
| `ccc` | `ccc:b{book}c{chapter}` (whole chapter) and `ccc:b{book}c{chapter}p{part}` (part `I`, `II`, `III`) | that chapter's (or part's) CCC rows mapped to their sense keys (§4.3 `pickSense`), every row kept, deduped by **sense** key only, in pack order | Virtual: built at runtime from bundled packs |
| `pleco` | `pleco:{category}` | matched or custom keys from import | `progress.lists` |
| `custom` | `custom:{newId}` | keys added by hand (search box over the item index) | `progress.lists` |

`getAllLists(progress, itemIndex)` returns one array of the same `List` shape for all three kinds. Part-level CCC lists exist for every part present in the data (Books 1–6 have I and II; Book 6 also has III). You can select any mix, e.g. B4 Ch 1 part I + B4 Ch 3 part II (RISKS Q8).

### 9.2 Derived per-list data
- `files(listId)` = `exerciseFiles` with that `listId`, not deleted.
- `variants(listId)` = sorted distinct `variant` numbers among its files.
- `latestScore(listId, variant)` = most recent `finished` TestRun.
- `nextVariant(listId)` = the variant never attempted, else the one whose latest run is oldest. A retake therefore serves a different variant when one exists. The UI lets you override.

### 9.3 Multi-select
The study picker holds `selection = { listIds: string[], tocflLevels: string[], includeBaseline: boolean, size: number|null, newMax: number|null }`. `size` and `newMax` are null for "All". It is persisted per device in `tocfl.<mode>.selection`. The queue is the union of items, deduped by key. Selecting a chapter and one of its parts is allowed; the union removes the overlap.

### 9.4 Flashcard queue (replaces `buildQueue`; no fixed cap)
```
items  = union(selection)
unless selection.includeBaseline: exclude untouched SOLID baseline items that came ONLY from tocflLevels or ccc lists
due    = items with card && reps>0 && isDue   (sorted by due asc)
fresh  = items with (!card || reps===0)        (selection order)
if newMax != null: fresh = fresh.slice(0, newMax)
queue  = [...due, ...fresh]
if size != null: queue = queue.slice(0, size)
if queue empty: show "Nothing due — N new available" (no silent 20-card 'rest' fallback)
```
- **You choose the size every time** in the picker: "How many cards: 20 · 50 · 100 · All · [number]" and "New cards: All · [number]". Both default to All. The Start button shows the exact number you'll get ("Start 137 cards").
- **Learning re-show (in-session):** after a rating, if the card is now in Learning or Relearning and its `due` is within the next 60 minutes, it is reinserted into the remaining queue 5 cards later (or at the end if fewer remain). When the end is reached and learning cards are still waiting, show "n cards still learning — continue / finish". This is what lets a Good on a new card graduate in the same session (§8.4).
- Items without a card get `newCardState()` when first rated.

## 10. Exercise files

### 10.1 Batches and type plan (the app decides; the AI follows)
- A list's items, in list order, are split into batches of 20 (the last batch may be smaller). `batch` is 1-based.
- For variant `v` (1-based), the type of the item at position `i` (0-based) in a batch is `TYPES[(i + v − 1) % 4]` with `TYPES = ['cloze','fill','usage','listening']`. Each word gets a different exercise type in variants 1–4.
- Cloze items are grouped, in order, into passages of 3–5 blanks: `n` cloze items → `ceil(n/5)` passages, sizes as even as possible. If `n < 3`, those items become `fill` instead.
- Grammar items (later) rotate over `['pattern-cloze','grammar-usage','error-spot']`.

### 10.2 Input file (exported by the app, attached to the AI prompt)
Filename: `gen-input_<listSlug>_b<batch>_v<variant>.json`
```json
{
  "format": "tocfl-tutor.exercise-input",
  "formatVersion": 1,
  "listId": "pleco:11月學字",
  "listName": "11月學字",
  "batch": 1,
  "batchCount": 3,
  "variant": 2,
  "itemType": "word",
  "targetBand": "B",
  "idPrefix": "pleco-11月學字-b1-v2",
  "items": [
    { "key": "遺憾|yíhàn", "hanzi": "遺憾", "pinyin": "yíhàn", "english": "regret; pity", "band": "B", "pos": null }
  ],
  "plan": [
    { "type": "cloze", "targets": ["遺憾|yíhàn", "完整|wánzhěng", "實際|shíjì"] },
    { "type": "fill", "targets": ["溫馨|wēnxīn"] },
    { "type": "usage", "targets": ["拒絕|jùjué"] },
    { "type": "listening", "targets": ["外婆|wàipó"] }
  ],
  "avoid": {
    "sentences": ["…sentences and passages already used for these items in other variants…"],
    "distractors": { "遺憾|yíhàn": [["可惜","後悔","抱歉"]] }
  }
}
```
`targetBand` = the highest band among the batch's TOCFL items (outside-TOCFL items count as `B`). `avoid` is filled from every already-imported file for the same list and batch, which is how variants stay non-overlapping.

### 10.3 Output file (what the AI returns, what the app imports)
```json
{
  "format": "tocfl-tutor.exercises",
  "formatVersion": 1,
  "listId": "pleco:11月學字",
  "batch": 1,
  "variant": 2,
  "itemType": "word",
  "generator": "Claude / DeepSeek / Gemini — free text",
  "exercises": [
    {
      "id": "pleco-11月學字-b1-v2-01",
      "type": "cloze",
      "band": "B",
      "targets": ["遺憾|yíhàn", "完整|wánzhěng", "實際|shíjì"],
      "passage": "……[[1]]……[[2]]……[[3]]……",
      "questions": [
        { "blank": 1, "target": "遺憾|yíhàn", "options": ["遺憾","可惜","後悔","抱歉"], "answer": "遺憾", "explanation": "English…" }
      ]
    },
    {
      "id": "pleco-11月學字-b1-v2-02", "type": "fill", "band": "B",
      "targets": ["溫馨|wēnxīn"],
      "sentence": "這家咖啡店佈置得很[[1]]，讓人覺得像在家一樣。",
      "questions": [ { "blank": 1, "target": "溫馨|wēnxīn", "options": ["溫馨","溫和","熱烈","親切"], "answer": "溫馨", "explanation": "…" } ]
    },
    {
      "id": "pleco-11月學字-b1-v2-03", "type": "usage", "band": "B",
      "targets": ["拒絕|jùjué"],
      "questions": [ { "target": "拒絕|jùjué", "prompt": "哪一個句子的「拒絕」用得正確？",
                       "options": ["…","…","…","…"], "answer": "…", "explanation": "…" } ]
    },
    {
      "id": "pleco-11月學字-b1-v2-04", "type": "listening", "band": "B",
      "targets": ["外婆|wàipó"],
      "audioText": "我外婆今年八十歲了，身體還很好。",
      "questions": [ { "target": "外婆|wàipó", "prompt": "說話的人在說誰？",
                       "options": ["媽媽的媽媽","爸爸的媽媽","媽媽的姊姊","太太的媽媽"], "answer": "媽媽的媽媽", "explanation": "…" } ]
    }
  ]
}
```
Field rules: `answer` is the exact text of one option. Blanks are `[[n]]`, numbered from 1 within each passage or sentence. For `cloze` and `fill`, `answer` equals the target's hanzi. `explanation` is English, 1–2 sentences. `listening` hides `audioText` until the question is answered.

Grammar types (reserved, rejected by the validator until grammar exists): `pattern-cloze` (same shape as cloze), `grammar-usage` (same as usage), `error-spot` (`sentence` + `questions[0].options` = 4 underlined segments written as `{{segment}}` in the sentence, `answer` = the wrong segment).

### 10.4 Validator (`src/lib/exerciseValidator.js`, pure, never throws)
`validateExerciseFile(text, { itemIndex, listId?, existingFiles }) → { ok, file, accepted: Exercise[], rejected: {id, reasons[]}[], warnings: string[], fatal: string|null }`

File-level (fatal → nothing imported, readable message):
- Strip a leading/trailing ``` fence and any text before the first `{` or after the last `}`, then `JSON.parse` inside try/catch. On failure report the line and column if available.
- `format === 'tocfl-tutor.exercises'`, `formatVersion === 1`, `exercises` is a non-empty array, `variant` and `batch` are positive integers, `itemType ∈ {word, grammar}`.
- `listId` exists (or the user picks a list on the import screen when it doesn't).

Per exercise (reject the exercise and list every reason):
- `id` is a non-empty string, unique in the file. A duplicate of an id in an existing file for the same list gets a warning and is re-suffixed `-dupN`.
- `type` ∈ allowed set for `itemType`.
- Every `targets[]` key exists in the item index. Each question's `target` is in `targets`.
- `cloze`: `passage` has markers `[[1]]…[[n]]` exactly once each, `3 ≤ n ≤ 5`, one question per marker with matching `blank`. `fill`: `sentence` has exactly one `[[1]]`.
- Each question: exactly 4 options, all non-empty strings, pairwise distinct after trimming. `answer` equals exactly one option. `explanation` is a non-empty string.
- `cloze`/`fill`: `answer` === target's hanzi. `usage`: every option contains the target's hanzi. `listening`: `audioText` contains the target's hanzi.
- `band` ∈ Novice/A/B/C.

Warnings (imported, but shown):
- Simplified-only characters found (check against a constant list of ~60 common simplified-only chars, e.g. 们这说时国会对过还没为发学经问见现进长门开关东车书买卖读认让谁请话语该边这样).
- A cloze/fill distractor is not a TOCFL word, or is a TOCFL word whose band is above `targetBand`.
- A sentence or passage text exactly matches one in another variant of the same list/batch.
- The plan in the input file was not followed (a target appears 0 or 2+ times).

The report screen shows: file summary, accepted count, rejected list with reasons, warnings. The "Import N exercises" button is disabled when N = 0.

### 10.5 Where exercise content is stored
- Valid exercises are re-serialized (only accepted items, plus `importedAt`) and written to `dataPath('exercises/<listSlug>/<fileId>.json')` in the data repo via `putTextFile`. Metadata goes into `progress.exerciseFiles`.
- `listSlug` = listId with `:` → `_`, keeping CJK characters (GitHub paths allow them).
- Loading: `loadExerciseFile(meta)` reads from a localStorage cache `tocfl.<mode>.exfile.<id>`, else fetches via `readFileContent` and caches. In `local` mode the import writes only to the cache.
- Exercise files live in the private data repo, so they never trigger a site deploy. (`deploy.yml` still gets `paths-ignore` for `progress.json` in Phase 0, for the weeks before the cutover.)

### 10.6 Review (verify-pass) file
Output of `docs/prompts/verify-exercises.md`:
```json
{
  "format": "tocfl-tutor.exercise-review", "formatVersion": 1,
  "listId": "pleco:11月學字", "batch": 1, "variant": 2, "reviewer": "free text",
  "findings": [
    { "exId": "…", "q": 0, "verdict": "ok" | "ambiguous" | "wrong-answer" | "unnatural" | "above-level" | "not-taiwan",
      "alternative": "option text or null", "note": "English" }
  ]
}
```
The verify pass runs on the AI's output *before* import, so it can't know the app's `fileId`. On import, findings are matched by `exId` among the non-deleted files of the list the review is imported into (exercise ids carry the list/batch/variant prefix, so they are unique). Unknown `exId`s are reported, not fatal. `ambiguous`/`wrong-answer` → `exerciseFlags[ref] = {status:'disabled'}`. Other non-ok verdicts → `warning`. Sets `exerciseFiles[id].reviewed = true`.

## 11. In-app exercises, tests, attempts, context score

### 11.1 Player
`ExercisePlayer` takes a list of question refs and a mode. It shows one question at a time:
- cloze: the passage with the active blank highlighted (`[[n]]` → numbered box; others show `（n）`), then 4 option buttons.
- fill: the sentence with the blank, then 4 buttons.
- usage: the prompt, then 4 full-width sentence buttons.
- listening: a ▶ button (speak `audioText` with the chosen voice), a "Replay" count, the prompt, 4 buttons. After answering, reveal `audioText` with pinyin of the target.

After a tap: lock the options, mark correct green and the chosen wrong one red, show the English explanation, the target `hanzi pinyin english`, and a "Next" button. Record an `Attempt` with `ms` measured from question shown to tap.

### 11.2 Practice mode
Pick a list (or "Gap list"), then activity type(s). The pool is all enabled questions from that list's files of the chosen types. Order: gap-list items first (§11.6), then items with the fewest attempts, then random. You choose how many questions (10 · 20 · 50 · All; default 20). `mode:'practice'`.

### 11.3 Test mode
List page → "Take test" → `nextVariant`. A test uses all enabled questions of that variant across the list's batches, in file order. Feedback and the explanation show after each question, as in practice. The score is first-try correctness (one answer per question). A `TestRun` is created at start. Leaving mid-test sets `status:'abandoned'` with the partial count, and it is not shown as the latest score. `mode:'test'`.

### 11.4 Rollup
After each merge, if `attempts.length > attemptLogMax`: take attempts with `at` older than 60 days, oldest first, until the length ≤ `attemptLogMax − 500` or no 60-day-old attempts remain. Fold them into `contextArchive.items[key]` (n, c, byType, exCorrect) and set `watermark` to the newest folded `at`. If nothing is older than 60 days, the log is allowed to exceed the max.

### 11.5 Per-item aggregate, the Context rule, and the understanding score
`contextStats(key)` = archive + raw attempts for that **one word** (all exercise types, practice and tests, plus graded sentences when `sentencesCount`):
```
n, c                      total attempts / correct
byType[type] = [n, c]
distinctCorrect           |exCorrect(archive) ∪ {fileId#exId of raw correct attempts}|
typesCorrect              number of distinct types with ≥ 1 correct answer
recentAcc                 weighted accuracy over this word's last R = recentWindow attempts (see below)
understanding             min(max, Σ points[type] over correct attempts, + sentenceNaturalBonus per natural sentence)
lastAt
```

**Context rule (approved 2026-10-29; every number is a setting in Settings → Counting):**
`contextQualified(k)` = `c ≥ minCorrect` **and** `distinctCorrect ≥ minDistinctExercises` **and** (`!requireDistinctTypes` or `typesCorrect ≥ 2`) **and** `recentAcc ≥ minRecentAccuracy`.

| Setting | Default | Meaning |
|---|---|---|
| `minCorrect` | 2 | How many times you must answer correctly about this word, in total |
| `minDistinctExercises` | 2 | Those correct answers must come from at least this many **different** questions, so repeating one memorized question twice doesn't count |
| `requireDistinctTypes` | off | If on, the correct answers must also span 2+ exercise types (e.g. cloze + usage) |
| `minRecentAccuracy` | 75% | Of this word's most recent attempts, the weighted share answered correctly |
| `recentWindow` | 10 | How many recent attempts that share looks at |
| `sentencesCount` | on | A graded sentence counts as one attempt (correct = grader's `correct: true`) |

**Weighted accuracy** is per word, not per test. Take this word's last 10 attempts. The newest has weight 1, the one before 0.8, then 0.64, and so on. Accuracy = (sum of weights of correct attempts) ÷ (sum of all weights). Recent answers matter more, so a word you used to miss and now get right recovers quickly. If fewer than 10 raw attempts exist and the archive has older ones, the archive's accuracy fills the missing slots.

**Understanding score** (per word, 0–10, shown as a small bar on the card back, in list tables, and in the gap list): +`points[type]` for each correct exercise answer or correct graded sentence. Defaults are 1 point each, capped at `max` = 10. Wrong answers don't subtract (accuracy already captures them). It's a depth meter. It doesn't decide the Context count; the rule above does. Reaching 10 on a word means about ten correct uses across exercises and sentences.

### 11.6 Gap list
Items where `isKnownCard(eff)` is true **and** (`n === 0` **or** (`n ≥ 2` and `recentAcc < 0.6`)). Sorted by `stability × (1 − recentAcc)` descending (untested items use `recentAcc = 0.5`). Shown on the dashboard as "Context gaps: N" → opens practice. Context results never change FSRS cards.

## 12. Sentence writing and grading

- Under the flashcard, a collapsed "✎ 造句" box opens a textarea plus a "Save" button. Saving creates a `SentenceEntry` with `status:'queued'`. A small count badge shows the queue size.
- Settings → Sentences: "Export grading packet" downloads `sentences_<date>.json` with all `queued` entries and marks them `exported`. "Import grades" accepts the grader's JSON (pasted or file).
- Packet format:
```json
{ "format":"tocfl-tutor.sentence-packet","formatVersion":1,"exportedAt":"…",
  "items":[{"id":"s_…","key":"遺憾|yíhàn","hanzi":"遺憾","pinyin":"yíhàn","english":"regret","sentence":"…","date":"2026-11-02"}] }
```
- Grades format:
```json
{ "format":"tocfl-tutor.sentence-grades","formatVersion":1,
  "results":[{"id":"s_…","correct":true,"natural":false,"corrected":"…","note":"English, ≤ 2 sentences"}] }
```
- Import matches on `id`, sets `grade` and `status:'graded'`, and reports unknown ids. The flashcard back shows the latest graded sentence for that word.
- When `contextRule.sentencesCount` is on, the import also appends one `Attempt` per graded sentence: `{ type:'sentence', fileId:'sentences', exId: entry.id, q:0, key: entry.key, mode:'practice', correct: grade.correct, chosen:'', ms:0 }`. Re-grading the same entry replaces that attempt (same id `a_sent_<entry.id>`), so a sentence never counts twice.

## 13. Study sessions and manual entries

- A header button "▶ 開始" starts a session. It shows a running `mm:ss` and changes to "■ 結束". The active session `{id,start,activities:Set,listIds:Set,counts}` is kept in localStorage `tocfl.<mode>.activeSession`, so a reload resumes it. There is no idle auto-pause.
- Every rating or attempt while a session is active adds to its `activities`, `listIds` and `counts`.
- "■ 結束" writes a `StudySession` (end = now). If the stored session is older than 12 h when the app opens, ask "End session at <last activity time> / now / discard?". The last activity time is stored with each update.
- Manual entry form (dashboard → "+ 手動紀錄"): date (default today), minutes, practice type (select + "Other" text), material (select of presets + "Other" text), notes. Edit and delete (tombstone) from a list under the form.
- Dashboard "Hours per week": stacked bars for the last 8 weeks (Mon–Sun, local zone), timer vs manual, plus "this week: X h".

## 14. Audio

### 14.1 TTS
- `listVoices()` returns zh voices sorted: `zh-TW` first, then names containing `Enhanced`/`Premium`/`增強`, then other `zh-*`.
- Settings → Audio: voice picker (stored per device: `tocfl.<mode>.tts = {voiceURI, rate}`), a rate slider 0.6–1.1, a "Test" button that speaks `今天天氣很好，我們去散步吧。`, and help text on downloading better iOS voices (iOS Settings → Accessibility → Spoken Content → Voices → Chinese (Taiwan) → Meijia, Enhanced/Premium).
- `speak()` uses the stored voice when present, otherwise the current rule.

### 14.2 Tone trainer fix
Hypothesis (to confirm on the phone): Chrome on iOS uses WebKit. Recent iOS reports `MediaRecorder.isTypeSupported('audio/webm') === true`, `pickMime()` picks it first, and WebKit's `decodeAudioData` cannot decode that container → "Unable to decode audio data". Fix: drop MediaRecorder and decoding. Capture PCM directly:
- Create the `AudioContext` synchronously inside the tap handler, then `await ctx.resume()`.
- `getUserMedia` → `MediaStreamSource` → `ScriptProcessorNode(4096, 1, 1)` → `ctx.destination` through a zero-gain `GainNode`. Copy each `inputBuffer.getChannelData(0)` into chunks.
- On stop: disconnect, stop tracks, concatenate, `analyzeContour(samples, ctx.sampleRate)`, then `ctx.close()`.
- ScriptProcessorNode is deprecated but works in WebKit and Chrome. It avoids a separate AudioWorklet module file.
- Before shipping, MicTest gets a "Record 2 s" diagnostic that prints sample rate, sample count and peak level.

## 15. Settings

### 15.1 Synced (`progress.studySettings`)
Fields in §5.4. Edited in Settings → Counting / Study. Changing `knownThreshold` or the baseline chapters updates today's numbers live and offers "Recompute history".

### 15.2 Per device (localStorage, namespaced by mode)
GitHub token and data repo `owner/repo` (§3.3; paths are derived from the mode, not editable), AI provider keys and models, TTS voice and rate, study selection, active session. The dead `enabledBands`/`unlockedBands` and the "Study levels" section are removed. The study picker replaces them.

### 15.3 Data section
- Mode banner text, effective `owner/repo:path` in the data repo.
- "Download progress.json": a Blob download named `progress-<mode>-<YYYYMMDD-HHmm>.json`.
- "Restore from file…": pick a JSON file → `migrate()` → show card count, reviewed count, log length, `updatedAt` → you type `RESTORE` → it replaces local state and does a **force save without merge** (this one path skips `mergeProgress`, otherwise the restore would be merged away). A backup of the current remote is written to `dataPath('backups/progress-pre-restore-<ts>.json')` first.

## 16. Grammar

### 16.1 Built now (so grammar is additive later)
- Item keys and `itemTypeOf()` (§4.1). Every module that handles keys calls `itemTypeOf` instead of assuming `|`.
- `Item` has the grammar fields (§4.2). `buildItemIndex` accepts a `grammar` array (empty today).
- Lists hold any item keys. The exercise input/output formats carry `itemType`. Grammar exercise types are reserved in the schema and validator.
- `Attempt.type` includes grammar types. Context aggregates are per key and type-agnostic.
- Snapshots: counting functions take an `itemType` parameter. The word counts filter to `type === 'word'`.
- `progress.grammar = {}` is reserved for grammar-specific state.

### 16.2 Decided, built after v2
- **Grammar uses FSRS** (decided 2026-10-29), with the same card model as words, keyed `g:<slug>`. A grammar card's front shows the pattern plus an English cue; the back shows example sentences. Exercises (`pattern-cloze`, `grammar-usage`, `error-spot`) feed Context exactly like words.
- **Sources found** (2026-10-29):
  - **TBCL 語法點分級標準** (Taiwan Benchmarks for the Chinese Language, National Academy for Educational Research). This is the official Taiwan grammar-point list by level, and TOCFL item writers use it as a reference. The NAER site describes about 500 grammar points across levels 1–5, published as an online search system (`coct.naer.edu.tw`, "語法點分級標準檢索系統"). **No downloadable file was found**, and the site is "版權所有" (all rights reserved). Plan: you export or copy the points for your levels by hand (or by copying the search result tables), and they go into the **private** data repo as `grammar/tbcl.json`, never the public app repo.
  - **CCC (當代中文課程)**: every lesson has a numbered grammar section, but there is no public list. Plan: type each lesson's grammar headings (or photograph the contents pages and have an AI transcribe them) into `grammar/ccc.json` with `{book, chapter, part, pattern}`. Then they become lists exactly like CCC vocab.
- Still to build: the grammar dataset loader (`grammar.js`: `{slug, pattern, level, english, examples[], sources}`), grammar lists in the picker, the grammar generation prompt, the dashboard grammar count (`snapshot.grammar`, a v4 migration), and the error-spot renderer.

## 17. File map

New: `src/data/exams.js`, `src/lib/logArchive.js`, `src/lib/dataMode.js`, `src/lib/schema.js`, `src/lib/migrate.js`, `src/lib/merge.js`, `src/lib/items.js`, `src/lib/counts.js`, `src/lib/dates.js`, `src/lib/ids.js`, `src/lib/lists.js`, `src/lib/queue.js`, `src/lib/pleco.js`, `src/lib/exerciseInput.js`, `src/lib/exerciseValidator.js`, `src/lib/exerciseStore.js`, `src/lib/context.js`, `src/lib/sessions.js`, `src/data/ccc.js`, `src/components/DataBanner.jsx`, `ProgressChart.jsx`, `PaceBox.jsx`, `GoalsEditor.jsx`, `HoursChart.jsx`, `StudyPicker.jsx`, `ListsView.jsx`, `ListDetail.jsx`, `PlecoImport.jsx`, `ExerciseImport.jsx`, `ExercisePlayer.jsx`, `SessionTimer.jsx`, `ManualEntryForm.jsx`, `SentenceBox.jsx`, `scripts/check-migration.mjs`, `scripts/check-counts.mjs`, `.env.development`, `.env.production`, `.github/workflows/ci.yml`.

Changed: `vite.config.js`, `.github/workflows/deploy.yml`, `.gitignore`, `package.json`, `src/App.jsx`, `src/hooks/useProgress.js`, `src/lib/github.js`, `src/lib/fsrs.js`, `src/lib/speech.js`, `src/lib/pitch.js`, `src/components/Dashboard.jsx` (old panels move into `ListsView`), `Flashcard.jsx`, `Settings.jsx`, `MicTest.jsx`. `useStudyFilter.js` and `DangdaiFilter.jsx` are replaced by `StudyPicker.jsx`; they are deleted in the phase that replaces them.
