# RISKS — discrepancies, risks, open questions

Updated 2026-10-29 with Shane's answers (§E) and the questions still open (§F). Originally verified against the repo on 2026-10-28 (local folder = remote `v2-update` at `8c9393c`, except that `docs/11月PLECO字.xml` was renamed locally to `docs/samples/pleco-sample.xml`).

## A. Blocking before Phase 0 (handled in WORKFLOW §1, no answer needed unless you disagree)

1. **This folder is not a git repo; your home folder is.** `git rev-parse --show-toplevel` prints `/Users/shanesilverman`. That repo's remote is Chinese-Study-Tool, its local `main` is stale (`76225ea` vs `origin/main` `8e730ca`), and it would stage your personal files (driver's license scan, E*TRADE PDF, financial spreadsheet) on a `git add -A`. → Work from a fresh clone (WORKFLOW §1 step 2). Optionally disable `~/.git` (step 0). The old copy in `Desktop/Taiwan Documents/美語工作/China Study App` can go to the Trash once the fresh clone (step 2) works.
2. **`npm run build` deletes `docs/`.** `vite.config.js` has `outDir: 'docs'`, `emptyOutDir: true`. The first build would erase SPEC/DESIGN/PHASES. → Phase 0 moves the build to `dist/` before anything else. CLAUDE.md forbids building before that.
3. **No CI runs on `v2-update`.** The only workflow is "Deploy to GitHub Pages" on `main`. → Phase 0 adds a build-only `CI` workflow for `v2-update`.

## B. Discrepancies between your notes and the repo

| # | Your note | What the repo shows |
|---|---|---|
| B1 → **revised 2026-10-30** | TOCFL dataset ≈ 7,500 entries | 7,517 rows. 283 hanzi+pinyin keys appear 2+ times: **273 are different senses** (different part of speech, e.g. 筆 N "pen" Novice vs 筆 M "sum of money" B1), 10 are true duplicates. The old converter merged them into one card with one gloss. → Phase 2.5 makes one item per sense (≈ 7,488) |
| B2 → **corrected 2026-10-30** | Bands Novice/A/B/C | The original source (`data-src/tocfl-cedict.csv`) **does** have six levels: Novice 394, A1 347, A2 485, **B1 1,173, B2 2,342**, C 2,776 rows. The old converter collapsed them to four bands (my 2026-10-28 note that B can't be split was wrong). → Phase 2.5 restores the levels |
| B3 | Distractors: same part of speech | **The TOCFL dataset has no part-of-speech field.** Only CCC entries have `pos`. The generation prompt asks the AI to match POS itself |
| B4 | Cards keyed `hanzi|pinyin` | Correct. But TOCFL pinyin isn't uniform: some keys hold `/` variants (`照片|zhàopiàn/xiàngpiàn/xiàngpiànr`, `爸爸|bàba/bà`), spaces (`dǎ diànhuà`), capitals (44). Matching needs normalization tiers (DESIGN §4.3) |
| B5 | Dangdai ≈ 4,989 rows from `dangdai-expanded.csv` | **4,960 rows** in `vocab/cccc-book1..6.json` (books: 570/658/846/986/929/971; chapters 15/15/12/12/10/10; parts I/II, book 6 has III). The CSV is **not** in the repo. The converter is tracked at an odd path, `Desktop/Taiwan Documents/美語工作/China Study App/scripts/convert-dangdai.mjs`, left over from the home-folder repo |
| B6 | CCC band | CCC `band` is derived from the book number (1–2 A, 3–4 B, 5–6 C), not from TOCFL. Counting uses TOCFL bands through matching |
| B7 | CCC packs part of the app | They load **at runtime through the GitHub API, only when a token is set**. Without a token, no CCC words exist, so a baseline would be 0. → Phase 3 bundles them into the build |
| B8 | "Speech recognition" feature | `recognizeOnce()` exists in `speech.js` but **nothing calls it**. The mic feature is the pitch-based tone trainer |
| B9 → **decided: stubs removed in v3** | Progress in `progress.json` | It has `version: 1`, 9,409 cards but only **277 reviewed**. **9,132 are empty stubs** (≈1.6 MB of the 2.68 MB file), because a stub is created for every vocab word at load. 62 legacy id-keyed cards (`n001`…) are all unreviewed. The review log has 375 entries since 2026-06-22 (complete; the 5,000 cap was never hit). Log entries have no ids |
| B10 | Sync via Contents API with sha | Correct, but **last-writer-wins**: two devices can overwrite each other's reviews. `saveProgress` ignored the passed sha and refetched. → fixed in Phase 2 (merge-on-save) |
| B11 | — | **Every progress save to `main` triggers a full Pages deploy** (116 workflow runs so far). → Phase 0 adds `paths-ignore` |
| B12 | — | The repo is **public**, so `progress.json`, future sentence logs and exercise files are publicly readable. → **Decided: private data repo** (DESIGN §3). Old progress stays in the public git history unless purged |
| B13 → **decided: no cap; size chosen per session, learning cards re-shown** | Flashcards capped at 40 | Confirmed: `App.jsx` `buildQueue` → `.slice(0, 40)`. When nothing is due it silently serves `rest.slice(0, 20)`. The Start button counts every due card (new cards are due immediately), so it says "Review 300 cards" and serves 40 |
| B14 | Single CCC chapter selection | Confirmed: `{book, chapter, list}` (one node). It also allows selecting a single part (I/II). See Q8 |
| B15 | — | Settings "Study levels" (`enabledBands`, `unlockedBands`) are **dead**: the queue uses the separate study filter. Phase 8 removes them |
| B19 | Card meanings (Shane, 2026-10-30: 筆 shows "sum of money", 對 shows "pairs") | **Cause:** the app keeps one word per hanzi+pinyin and shows whichever list's gloss loaded last; CCC Book 4/5 measure-word rows overwrote the earlier meanings (126 CCC keys have different meanings; 2,072 keys show the CCC gloss instead of TOCFL's). The runtime pack loader also dropped 68 CCC rows that repeat a word within one book (對 "to" missing from B1 Ch 13), and 231 TOCFL entries lost their variant characters (她, 妳, 相片…). **No progress was lost:** all reviewed cards are intact (checked 2026-10-30, 338 reviewed); 29 of them are multi-sense words whose history stays on the main sense. → Phase 2.5 |
| B16 | — | The seed `tones` arrays look wrong for multi-syllable words (e.g. 坐牢 zuòláo → `[2]`). The tone trainer uses `primaryTone(tones)`, so it may compare against the wrong tone. Out of scope; noted for Phase 16 |
| B17 | Pleco format | Matches, except that `headword`, `pron` and `defn` are nested inside `<entry>`, not directly under `<card>`. `defn` contains newlines and example sentences. The sample's 10 cards: **7 exact TOCFL matches, 3 not in TOCFL** (新任, 爬山, 溫馨) |
| B18 | — | The AI tutor's default model is `claude-sonnet-4-20250514`. Not in scope; change it in Settings if you like |

## C. Facts you asked me to verify

- **One Good on a new card already exceeds 3 days.** ts-fsrs 4.7.1 default weights give first-rating stability Again 0.40, Hard 1.18, **Good 3.17**, Easy 15.69. Your data confirms it: 97 cards sit at 3.173 after a single Good. Today 187 of your 277 reviewed cards are above 3 days. With T = 3, "Known" means "rated Good or Easy at least once". See Q1.
- **Baseline size** (2026-10-29, full matching): solid tier B1 Ch 1 → B3 Ch 9 = **1,268**; studied tier B3 Ch 10 → B4 Ch 4 = **325**. Full brief: `docs/CCC-TOCFL-GAP.md`.
- **Pace reality check:** from a Known of ~1,500 (baseline + reviewed) to 5,000 by 2027-04-15 is ~3,500 words in ~24 weeks ≈ **146 Known/week**. With T = 3 that is easy to reach on paper (one Good each); with T = 21 it means real retention.

## D. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Merge bug in Phase 2 | Silent loss of reviews | Pure function + check script + mandatory Opus review + pre-v3 backup + git history |
| An old app tab writes after the v2 merge | Older card states overwrite newer ones (old code is last-writer-wins) | WORKFLOW §8 step 8: reload every device. New code refuses to save over a newer schema |
| Baseline matching errors | Known off by tens of words | Tiered matching, printed report, Opus review of Phase 3 |
| Snapshots written before data is ready | A bogus dip in the graph | Snapshots only after migration + bundled CCC + first pull settled (Phase 4) |
| Exercise files written to `main` from the live app | Repo clutter, deploy runs | `paths-ignore`; files live under `exercises/` |
| AI output quality (two right answers, Mainland usage, level creep) | Measures the wrong thing | Strict prompt, validator warnings, optional verify pass that disables bad questions |
| progress.json growth | Slow sync on mobile data | Stubs removed in v3 (file ≈ 0.1 MB), compact JSON, attempt rollup, log archive, exercise content in separate files |
| Phone testing over self-signed HTTPS | iOS Chrome may refuse the dev certificate | Use Safari for dev tests (same engine); live use stays in Chrome |
| Tone trainer root cause is a hypothesis | Phase 16 might need another round | Phase 16 adds a diagnostic recorder first |
| A device offline for 60+ days | Its old context attempts are dropped after rollup | Documented; unlikely |
| Sonnet runs out of context in Phase 8 (largest UI phase) | A half-finished phase | Split point defined in the phase; WIP commit procedure in WORKFLOW §2 |

## E. Your answers (2026-10-29) and what changed

| Q | Answer | Change made |
|---|---|---|
| Q1 Known | 3 days is right; too-easy words should graduate | Known = stability > 3 **and** graduated (Review state). Easy graduates at once. Learning cards now re-show in the same session (DESIGN §8.4, §9.4) |
| Q2 Baseline | Completed B4 Ch 4; reviewing B3 Ch 10 → B4 Ch 4 | Two tiers: solid to B3 Ch 9 (Known), studied B3 Ch 10 → B4 Ch 4 (Seen until confirmed) (§8.2) |
| Q3 Goals | Use real TOCFL dates, toggle on dashboard | Official 2026–2027 dates in `EXAM_DATES`; exam selector on the dashboard (§5.5, §8.6, Phase 5) |
| Q4 Context rule | OK for now; easy to adjust; explain | Approved by default; every number is a setting with help text (§11.5) |
| Q5 Stubs | Don't keep empty stubs | v3 migration and merge remove them after a backup; cards are created on first rating (§6.1, §7) |
| Q6 `~/.git` | Explain | See chat; still your call |
| Q7 Privacy | Private, if phone + sync still work | Private data repo + fine-grained token; site stays free (§3, WORKFLOW §1 step 5, cutover in §8) |
| Q8 CCC parts | Need part-level, any mix | `ccc:b4c1pI`-style lists, any mix (§9.1, Phase 8) |
| Q9 Sentences | Yes; plus a 10-point understanding value | Graded sentences count as attempts; per-word understanding score 0–10 (§11.5, §12) |
| Q10 Homographs | OK | Unchanged |
| Q11 Backfill | Build from course history, not 100% known | Course-history estimate + FSRS replay (§8.5, Phase 6). Dates confirmed: 2025-09-01 at B1 Ch 3 → 2026-08-19, finished B4 Ch 4 |
| Q12 Milestones | Default OK | Unchanged. First merge also does the data cutover |
| DESIGN §2 log cap | Will 5,000 be a problem? | Yes (≈ 3–5 weeks at your pace). Replaced by monthly archive files, never dropped (§8.5) |
| DESIGN §16.2 Grammar | Grammar uses FSRS; find lists | TBCL grammar points (online, no download, all rights reserved) and CCC lesson grammar (manual entry), both kept in the private repo (§16.2) |

## F. Still open (defaults apply if you don't answer)

- ~~F1. Course history dates~~ **Answered 2026-10-29:** started 2025-09-01 at Book 1 Ch 3; finished B4 Ch 4 on 2026-08-19. Now the default `courseHistory`.
- ~~F2. Which exam?~~ **Answered 2026-10-29:** May 15–16, 2027 (registration Apr 5–16) is the default goal; switchable on the dashboard.
- **F3. Purge old public history?** After the cutover, your old progress stays visible in the public repo's git history. Purging rewrites history and is a one-off job. *Default: leave it.*

## Implementation notes
(Sonnet sessions append here when a spec gap forces a conservative choice.)
- Phase 1A: `assertWriteAllowed` takes no settings argument, so it reads the data repo `owner/repo` from the mode-namespaced settings in localStorage (default `Chinese-Study-Data`). Restore skips the remote backup only when no token is set (nothing remote to back up).
- Phase 1A review (Opus): Settings.jsx Data repo / Download / Restore were missing from the commit and were added in the review fix. `forcePush` now ignores non-progress arguments (it was wired as `onClick={forcePush}` and received the click event). Known gap until Phase 3: runtime vocab packs now come from the data repo `vocab/` folder, which is empty, so the CCC tab shows no packs in dev builds until Phase 3 bundles them.
- Phase 2: Settings "Push now" used `forcePush()`, which would now be an unmerged overwrite. The spec keeps `forcePush` for Restore only, so "Push now" calls a new `saveNow` (a normal merge-save) and `forcePush` ignores anything that isn't a progress object. Not in the phase's file list: `Settings.jsx` and the `App.jsx` prop were touched for this.
- Phase 2: `saveProgress` treats 409 and any 422 whose body mentions a sha as a conflict (re-fetch, re-merge, max 3 tries). Other 422s throw. A stale-view "sha wasn't supplied" 422 (file exists, we thought it didn't) is therefore also a conflict.
- Phase 2: a pre-v3 remote is migrated before merging, which stamps a second `2→3` entry in `migrations` (different `at`) next to the local one. Harmless, one-time. `backupPath` is filled on every `migrations` entry with `from < 3` and no path.
- Phase 2: `grammar` has no merge rule in DESIGN §7 yet, so it follows the unknown-key rule (remote wins on conflict). Revisit in the grammar phase. `rollupAttempts`/`archiveLog` are not wired yet (Phases 6, 14); the save flow has no hook for them.
- Phase 2: after a Restore, another device that still holds newer cards will merge them back in (merge never deletes). Restore is only a clean overwrite if every other device is reloaded or restored too.
- Phase 2: scheduled saves flush on `visibilitychange → hidden` only when there are unsaved changes (no empty commits). Not run on a real two-device test or the phone here; acceptance checks 2–4 still need doing by hand.
- Phase 2.5: the build gives **7,505 senses** (7,215 main + 290 extra, 12 true duplicates), not the spec's "about 7,488 / 273 / 10". The grouping is exactly the spec's rule (first form + full Pinyin; 283 keys appear 2+ times, which matches), so the spec's extra/duplicate split was an estimate. The check script asserts main + extra + merged = 7,517.
- Phase 2.5: a `<br>` segment that doesn't start with the key hanzi (forms like `小孩(子)` whose Meaning lists the expanded forms) falls back to the **first segment**, not the whole Meaning (the whole Meaning would show several `x [pinyin]` prefixes). Entries whose key hanzi has a bracketed part (`小孩(子)`) get no `variants`, since Variants lists the expanded forms already encoded in the key.
- Phase 2.5: all-neutral readings (嗎 ma) get `tones: [5]`, as the old arrays did, instead of `[]`, so `primaryTone` keeps working.
- Phase 2.5: a CCC row gets a `key` only when its exact `hanzi|pinyin` is a TOCFL group and its POS picks an **extra** sense (so 筆 M → `筆|bǐ#M`). All other CCC rows keep the implicit `hanzi|pinyin` key; the full matching tiers are Phase 3.
- Phase 2.5: an extra sense's card stores its `key` (only when it differs from `hanzi|pinyin`) so `cardKey(card)` re-keys it correctly in `reconcile`. `rate()` called with a bare extra-sense key strips `#POS` from the pinyin. Not in the phase's file list: `useProgress.js`, `useStudyFilter.js`.
- Phase 2.5: the "In this lesson: …" line under the gloss (DESIGN §4.4) is not in the Phase 2.5 file list and is not built.
- Phase 2.5: the CCC source reuses an `ID` for alternative readings (這 zhè / zhèi share `B1L01-I-12`). The first keeps the ID, repeats get `-2`, `-3`, so rows are distinct by `id`. 'B1 lesson 13' in the check means Book 1 Lesson 13.
- Phase 2.5 review (Opus): `reconcile()` now keeps every card stored under a modern key (contains `|`) exactly where it is, and only re-maps legacy keys, never overwriting an existing card. Before, it re-keyed every card from its contents, so an extra-sense card that ever lost its stored `key` would have overwritten the main-sense card. Checked on live data: all 9,347 modern keys already equal their card-derived key, so behaviour is unchanged today.
- Phase 3: `node scripts/check-counts.mjs` on the sense data: 7,505 TOCFL senses (7,215 main + 290 extra), 7,517 rows. CCC match tiers, books 1–3: exact 1,419, normalized 23, variant 43, hanzi-unique 43, ambiguous 2 (哪|něi, 一點|yìdiǎn), none 460, name 84 (name-tagged rows never match or count). All books: exact 2,838, normalized 36, variant 56, hanzi-unique 68, ambiguous 2, none 1,731, name 229. Baseline: solid 1,289 (Novice 314, A1 244, A2 239, B1 237, B2 211, C 44), studied 327 (5, 14, 32, 112, 123, 41). Gap through B4C4 / later / never: 1,616 / 1,232 / 4,657. Build: JS 2,569.57 kB (659.87 kB gzip).
- Phase 3 choices (spec silent): a CCC row's item key is the matched TOCFL sense key for tiers exact/normalized/variant (so it is the TOCFL item), but a hanzi-unique row stays its own item (`這|zhèi`) with `tocflKey` set, so the two forms stay separate cards that count together. The raw `hanzi|pinyin` of every CCC row also stays resolvable as an alias item so existing cards keep resolving. Name-tagged rows are never matched. `item.tocflKey` of a CCC item shared by rows with different POS is the first row's; baseline and `firstChapterOf` use the per-row `rowInfo(row)`.
- Phase 3 review (Opus): (1) `buildItemIndex` stored `band` as the first letter (`v.band?.[0]` on a string gave `N`); fixed. (2) Six reviewed cards stored under a raw CCC spelling (事|shì, 叔叔|shúshu, 救護車|jiùhù chē, 增加|zēngjiā, 頭髮|tóufǎ, 多半|duōbàn) would have reappeared as new cards, because CCC rows now study under the TOCFL key. Added `studyKeyOf` (DESIGN §4.3 "Study key"); `buildQueue` and `handleRate` use it, `currentWord` resolves raw keys, and the queue dedupes by study key. Phase 8 must keep using `studyKeyOf`.
- Phase 4: `recomputeHistory` takes the baseline `{solid, studied}` sets and derives per-date untouched counts itself (spec named a `baselineFor` callback). Snapshots without `raw.tails` (e.g. future `estimate` points) are left unchanged. A reviewed card with no `firstSeen`/`last_review` counts as touched on every date. Today's snapshot write is skipped when only `computedAt` would change (avoids save churn). Snapshot trigger (b) "study session ends" waits for Phase 7 (`snapshotNow()` is exposed by `useCounts`).
- Phase 4 review (Opus): `updateProgress` scheduled a save even when `fn` returned the same object, so the "skip unchanged snapshot" logic still produced a commit on every app open and every 10-minute hide. `apply` now returns whether state changed and `updateProgress` saves only then. Independent recount on origin/main progress (cards → tocflKey, max stability, graduated & S>3, plus untouched solid) matches the engine: reviewed TOCFL 285, Known 1,279, Seen 1,635.
- Phase 5: `EXAM_DATES` `bands` is `'A–C'` for Listening & Reading and the band letter for speaking/pilot entries (DESIGN gave no per-exam LR bands). The old stats grid (due/streak/learned/retention) moved inside the "Details" disclosure; "Due today" is shown in the Today card. Exams on or before a goal's start date are hidden from its exam selector. Goals editor saves only goals that changed, stamping `updatedAt`. Pace math lives in `src/lib/pace.js`.
- Phase 6: `archiveLog` returns `{ progress, archived, error }` (not a bare progress) and takes an optional `io` argument so the check script can fake the data repo; the GitHub io is imported lazily to keep the module Node-safe (Vite prints a harmless "dynamically imported" notice). Archiving runs on a save when not yet done today (localStorage `logArchiveDay`, stamped only on success); a failure only logs a console warning and the save proceeds.
- Phase 6: `estimateCourseHistory` got optional `existing` and `beforeDate` arguments (spec says estimates are written only before the first log date and never over existing snapshots). Weekly points start on `courseHistory.start.date`; the end date itself is the last one. Chapters before the start chapter count as done on the start date; start..end chapters complete evenly. With baseline disabled no estimates are written.
- Phase 6: `recomputeHistory` now skips `source:'estimate'` snapshots (they carry no review data). Backfill snapshots inside the course period are still recomputed against the configured baseline by "Recompute history".
- Phase 6: `__tt.setLogKeepDays(n)` saves `logKeepDays` into synced studySettings (it is a real setting); set it back to 90 afterwards. Check on the 2026-10-30 copy: replay matches 371/371 keys (100%).
- Phase 6 review (Opus): archive writes happen before entries leave `progress.log`; a failed month write or a failed progress PUT leaves the log intact (duplicates in month files are unioned later). check-backfill 371/371, check-log-archive PASS. Known edge (accepted, as for attempts): log entries from a device offline longer than `logKeepDays` that are older than the watermark are dropped by merge before they can be archived.
