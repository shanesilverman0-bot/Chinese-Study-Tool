# RISKS — discrepancies, risks, open questions

Updated 2026-10-29 with Shane's answers (§E) and the questions still open (§F). Originally verified against the repo on 2026-10-28 (local folder = remote `v2-update` at `8c9393c`, except that `docs/11月PLECO字.xml` was renamed locally to `docs/samples/pleco-sample.xml`).

## A. Blocking before Phase 0 (handled in WORKFLOW §1, no answer needed unless you disagree)

1. **This folder is not a git repo; your home folder is.** `git rev-parse --show-toplevel` prints `/Users/shanesilverman`. That repo's remote is Chinese-Study-Tool, its local `main` is stale (`76225ea` vs `origin/main` `8e730ca`), and it would stage your personal files (driver's license scan, E*TRADE PDF, financial spreadsheet) on a `git add -A`. → Work from a fresh clone (WORKFLOW §1 step 2). Optionally disable `~/.git` (step 0). The old copy in `Desktop/Taiwan Documents/美語工作/China Study App` can go to the Trash once the fresh clone (step 2) works.
2. **`npm run build` deletes `docs/`.** `vite.config.js` has `outDir: 'docs'`, `emptyOutDir: true`. The first build would erase SPEC/DESIGN/PHASES. → Phase 0 moves the build to `dist/` before anything else. CLAUDE.md forbids building before that.
3. **No CI runs on `v2-update`.** The only workflow is "Deploy to GitHub Pages" on `main`. → Phase 0 adds a build-only `CI` workflow for `v2-update`.

## B. Discrepancies between your notes and the repo

| # | Your note | What the repo shows |
|---|---|---|
| B1 | TOCFL dataset ≈ 7,500 entries | 7,517 rows but **7,215 unique `hanzi|pinyin` keys**. 302 keys appear twice, 217 of them with different bands (e.g. 在|zài in Novice and B). They share one FSRS card. Counts use 7,215 |
| B2 | Bands Novice/A/B/C | Correct: Novice 394, A 832, B 3,515, C 2,776 rows. **B is not split into B1/B2.** Unique keys by lowest band: Novice 394, A 829, B 3,320, C 2,672. Novice+A+B = 4,543, so **5,000 Known requires some C words** |
| B3 | Distractors: same part of speech | **The TOCFL dataset has no part-of-speech field.** Only CCC entries have `pos`. The generation prompt asks the AI to match POS itself |
| B4 | Cards keyed `hanzi|pinyin` | Correct. But TOCFL pinyin isn't uniform: some keys hold `/` variants (`照片|zhàopiàn/xiàngpiàn/xiàngpiànr`, `爸爸|bàba/bà`), spaces (`dǎ diànhuà`), capitals (44). Matching needs normalization tiers (DESIGN §4.3) |
| B5 | Dangdai ≈ 4,989 rows from `dangdai-expanded.csv` | **4,960 rows** in `vocab/cccc-book1..6.json` (books: 570/658/846/986/929/971; chapters 15/15/12/12/10/10; parts I/II, book 6 has III). The CSV is **not** in the repo. The converter is tracked at an odd path, `Desktop/Taiwan Documents/美語工作/China Study App/scripts/convert-dangdai.mjs`, left over from the home-folder repo |
| B6 | CCC band | CCC `band` is derived from the book number (1–2 A, 3–4 B, 5–6 C), not from TOCFL. Counting uses TOCFL bands through matching |
| B7 | CCC packs part of the app | They load **at runtime through the GitHub API, only when a token is set**. Without a token, no CCC words exist, so a baseline would be 0. → Phase 3 bundles them into the build |
| B8 | "Speech recognition" feature | `recognizeOnce()` exists in `speech.js` but **nothing calls it**. The mic feature is the pitch-based tone trainer |
| B9 → **decided: stubs removed in v3** | Progress in `progress.json` | It has `version: 1`, 9,409 cards but only **277 reviewed**. **9,132 are empty stubs** (≈1.6 MB of the 2.68 MB file), because a stub is created for every vocab word at load. 62 legacy id-keyed cards (`n001`…) are all unreviewed. The review log has 375 entries since 2026-06-22 (complete; the 5,000 cap was never hit). Log entries have no ids |
| B10 | Sync via Contents API with sha | Correct, but **last-writer-wins**: two devices can overwrite each other's reviews. `saveProgress` ignores the passed sha and refetches. → Phase 2 merge-on-save |
| B11 | — | **Every progress save to `main` triggers a full Pages deploy** (116 workflow runs so far). → Phase 0 adds `paths-ignore` |
| B12 | — | The repo is **public**, so `progress.json`, future sentence logs and exercise files are publicly readable. → **Decided: private data repo** (DESIGN §3). Old progress stays in the public git history unless purged |
| B13 → **decided: no cap; size chosen per session, learning cards re-shown** | Flashcards capped at 40 | Confirmed: `App.jsx` `buildQueue` → `.slice(0, 40)`. When nothing is due it silently serves `rest.slice(0, 20)`. The Start button counts every due card (new cards are due immediately), so it says "Review 300 cards" and serves 40 |
| B14 | Single CCC chapter selection | Confirmed: `{book, chapter, list}` (one node). It also allows selecting a single part (I/II). See Q8 |
| B15 | — | Settings "Study levels" (`enabledBands`, `unlockedBands`) are **dead**: the queue uses the separate study filter. Phase 8 removes them |
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
