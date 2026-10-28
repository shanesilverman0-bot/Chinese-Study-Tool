# 習字 / TOCFL Tutor v2: Spec for Claude Code

Save this file as `docs/SPEC.md` in the Chinese-Study-Tool repo. Start Claude Code in the repo root, switch to the `opusplan` model, enter plan mode, and give it this prompt:

> Read docs/SPEC.md in full. Inspect the repo. Then produce the deliverables listed under "DELIVERABLES" as files in docs/. Do not write application code in this session.

---

## ROLE

You are the architect for an update to a personal Mandarin study app. You are running inside the repo, so you can read the code directly. Produce design documents and an ordered set of phase specs that a separate Sonnet session will implement, one phase per session. Do not write application code in this session. Specs, schemas, and prompts only.

Open-ended thinking happens here. The phase specs you write must be fully prescriptive so Sonnet does not have to make design decisions.

## RULES THAT APPLY TO EVERY SESSION (put the short version in CLAUDE.md)

- Work only on the branch `v2-update`. Never commit to or push `main`. Never merge. I merge after testing on my phone.
- GitHub Pages deploys from `main` and my live `progress.json` syncs through the GitHub Contents API. Nothing on `v2-update` may write to the live `progress.json` on `main`.
- Dev builds must use a separate data file or have sync disabled. Design this explicitly in Phase 1 (for example, a `VITE_DATA_MODE=dev` flag that points sync at `progress.dev.json` or turns it off). Never test against live data.
- Validation is `npm run build` plus GitHub Actions. There is no test suite. Do not add one unless a phase spec says so.
- Existing `progress.json` data must keep working. Any schema change needs a versioned migration (`schemaVersion` field) that is idempotent and never deletes data.
- Traditional Chinese characters only, Taiwan usage, tone-marked pinyin.
- Mobile-first. My primary device is an iPhone using Chrome.
- Commit after each phase with a clear message. Push the branch after each phase.

## BEFORE YOU DESIGN

Everything below about the current codebase comes from my notes and may be stale. Verify it against the repo and list every discrepancy. If something blocks the design, ask me before continuing. Otherwise state your assumptions and proceed.

Files I may add to the repo for you: `docs/samples/pleco-sample.xml` (a Pleco export). If it is missing when you need it, ask me for it.

## USER AND GOAL

I'm Shane, living in Taipei. I passed TOCFL B1 (about 2,300 words known) and want to pass TOCFL B2 around late March/April 2027. That means about 2,700 new words in about 5 months, roughly 135 per week. The test is recognition only (reading and listening, no production), so I'm structuring study around passing it. Main risk: retention. Knowing a word's meaning in isolation is not enough. I need to recognize it correctly in context.

## CURRENT APP (verify)

- 習字 / TOCFL Tutor: React + Vite + Tailwind, deployed on GitHub Pages (Chinese-Study-Tool repo). I am not a coding expert.
- FSRS spaced repetition via ts-fsrs. Cards keyed by composite `hanzi|pinyin` (handles homographs).
- Vocabulary: TOCFL/CEDICT dataset (about 7,500 entries; bands Novice, A, B, C; Traditional Chinese, tone-marked pinyin). Dangdai/CCC curriculum packs from `dangdai-expanded.csv` (about 4,989 rows across six books).
- Progress stored in `progress.json`, synced across devices by committing via the GitHub Contents API (PUT needs the file sha).
- Existing features: tone curve visualization, speech recognition, AI tutor (Claude API, DeepSeek secondary), band/Dangdai filters.

## FEATURES

### A. Front-page dashboard (new landing screen)

- Line graph, x = time, y = words, three tracked counts:
  1. Seen: words seen at least once.
  2. Known: words whose FSRS stability is above 3 days. This threshold must be a setting. Note: one Good rating on a new card may already exceed it, depending on the ts-fsrs weights in use. Verify in the code and tell me.
  3. Context: words with in-context mastery (see C).
- Store one snapshot per day (date plus the three counts) in the progress data. Counts must be recomputable if I change a threshold.
- Goal lines, toggleable on/off, each with label, date, target, and enabled flag. Initial goals: April 2027 test (starting baseline to about 5,000), June, and July-December. I must be able to edit a goal's end date and target value (for example move April to May).
- Pace readout goes in a box beside the graph, not on the graph. It computes words per week needed from today's Known count to the selected goal, shows my trailing 4-week actual rate, and the gap. Pace applies to Known only. Context gets no pace line. It is a separate metric because only some words need context practice.
- Baseline: assume all words in CCC books before my current position are already known (cutoff is a setting: book plus chapter; I said around Book 4). I will not mark known words by hand. Count only baseline words that are also in the TOCFL list, so the y-axis stays in TOCFL words and the goal line starts at that number (I expect it to differ from 2,300). Baseline words count toward Seen and Known, not toward Context, and do not enter the review queue. If a baseline word later gets an FSRS card whose stability falls to 3 days or below, it leaves the baseline and the normal count applies.
- Other progress info on the page: study hours per week from the session timer. From the page I choose the activity (flashcards, cloze, usage check, and so on) and the list.

### B. Study lists

- A list is one unified object: id, name, source type (CCC chapter, Pleco export, custom), item keys, attached exercise files, test-score history. CCC chapters and Pleco months use the same mechanism.
- Pleco import from XML export. Structure: root `plecoflash` with `card` elements. Each card has `headword` elements with charset `sc` and `tc`, a `pron` element with numeric tones and no separators such as `xin1ren4` and `nai3nai5` (5 is the neutral tone), a `defn` element containing raw dictionary text, a `dictref`, and one or more `catassign` category names. Importer rules:
  - Match on the traditional headword.
  - Split pinyin after each digit and convert to tone marks, normalizing spacing for key matching.
  - One list per category.
  - Prefer the dataset's gloss and keep the Pleco text as reference.
  - Words missing from the dataset become cards tagged `outside-TOCFL` and do not count toward the 5,000 target.
  - Flag unmatched or ambiguous homographs for me to resolve instead of guessing.
  - (A Pleco .pqb SQLite backup also exists, but I will use XML.)
- Also support plain custom lists.
- Per-list recognition tests: each list has multiple distinct generated test variants over the same material (test 1, 2, 3). Retaking a variant updates that variant's most recent score. The list shows the most recent attempt. Keep the full attempt history in the log and display only the latest. A retake of a test should serve a different variant, because repeating the same items measures memory of the answers. The generation prompt must be able to produce multiple non-overlapping variants per list.

### C. Words-in-context practice and the context score

- Modes, modeled on TOCFL:
  1. Reading cloze: a short paragraph with 3-5 blanks and 4 options.
  2. Single-sentence fill-in: pick the best word.
  3. Usage check: four sentences, pick the one that uses the target word correctly.
  4. Listening: the OS speech-synthesis voice reads a sentence and I answer. TTS uses the free browser voice, not a paid service.
- Distractors should be same-band words with the same part of speech and plausible meaning, so the item tests usage rather than elimination.
- Context score is separate from FSRS. Store an append-only attempt log (exercise id, item key, date, correct, chosen option, time) and derive per-item aggregates (weighted accuracy over recent attempts, breakdown by exercise type). Roll up or cap the log so `progress.json` stays small.
- Initially, context results do not feed back into FSRS. Surface a gap list of words with high FSRS stability but low context accuracy and use it to prioritize exercises.
- PROPOSED, not yet confirmed by me: a word counts toward the Context total when it has enough correct answers across at least two different exercises. Make the rule a setting and flag it for my approval.

### D. AI-generated exercise content (two-file workflow)

- I pair a word list with a prompt, run it in any AI (Claude, DeepSeek, Google), and import the result. You write that generation prompt as a deliverable.
- Input file: the target items (hanzi, pinyin, English, band). Output file: strict JSON exercises with id, type, target item keys (same `hanzi|pinyin` format), text with blanks, options, answer, an English explanation, and band tag.
- Prompt constraints: all non-target vocabulary must be at or below the target band; exactly one defensible answer; Traditional characters and Taiwan usage; batches of about 20 words; output JSON only.
- The app needs an import validator: check schema, check the answer is among the options, check target keys exist in the dataset, reject bad items with a readable report, never crash.
- Recommend an optional second pass (another model) that tries to find an alternative correct answer, and write that prompt too.
- I want to take these tests inside the app. Design the generation prompt to request a file format and a UI that lets me mark answers in the app (score, log attempts, show explanations).

### E. Sentence writing and grading

- A text box under each flashcard to write a sentence using the word. Sentences queue up and export as a grading packet file (word, sentence, date). Write the grading prompt that returns JSON (correct, natural, corrected sentence, short note). The app imports the results and attaches them to the word's context record.
- Keep this light. It is the lowest priority of the new work.

### F. Earlier update list (fold in and sequence; I ranked these)

1. Session timer: a start-study button logging date, duration, and what was studied (lists) to metadata. No idle auto-pause. I end sessions manually. Plus a simple manual-entry form for study done outside the app (materials, practice type such as listening/reading/writing/vocabulary, each with a free-text option), extensible later.
2. Multi-select of CCC chapter lists (currently one only).
3. More natural audio: use free OS voices.
4. Flashcard sessions are capped at 40 words even when the set is larger. Fix.
5. Low priority: tone trainer fails with "Could not decode the recording: Unable to decode audio data" and has never worked.

### G. Grammar (later phase; design for it now, do not build it yet)

I will later source a TOCFL grammar list and want recognition tests for grammar structures, to confirm solid command before the exam. Requirements on the current design:

- The core data model must use a generic item concept with a type (word or grammar point) instead of assuming every item is a word. Grammar points need stable ids (pattern, level, example sentences), not `hanzi|pinyin`.
- Lists, the attempt log, exercise files, validator, and import workflow must work for either item type.
- Grammar gets its own recognition-test variants (pattern cloze, choose the correctly used sentence, error spotting), its own score, and its own dashboard count, kept separate from the word counts and from the 5,000-word target.
- Specify the schema changes needed now so adding grammar later is additive, and list what you would defer.

## DELIVERABLES (write each as a file in the repo)

1. `docs/RISKS.md`: short list of risks and unresolved questions, including every discrepancy between my notes and the repo. Ask me first only if blocking.
2. `docs/DESIGN.md`: final data schemas at field level: list, item, attempt log, daily snapshot, goal, settings, exercise file, results, study session, manual study entry. Include `schemaVersion`, the migration plan, the dev-data-mode design, and the grammar-additive notes (with a deferred list).
3. `docs/PHASES.md`: ordered phases with dependencies. Requirements for each phase:
   - Small enough to build in one Sonnet session without a context reset. If a feature is too big, split it.
   - Exact files to create or change, behavior, edge cases, and acceptance checks I can observe on screen or in the console (not "works").
   - Migration steps for any schema change, tested against a copy of `progress.json`.
   - The git sequence: `npm run build`, commit, push to `v2-update`, then confirm GitHub Actions passes.
   - A one-paragraph "session prompt" at the top of the phase that I can paste into a fresh Claude Code session (for example: "Read docs/DESIGN.md and Phase N in docs/PHASES.md. Implement only Phase N. Run npm run build and fix errors. Commit and push to v2-update.").
   - A "Review with Opus?" flag (yes or no, with the reason) for phases that carry data-loss or counting risk.
   - A note if Sonnet is unlikely to execute the phase reliably, and which model I should use instead.
   - Phase 1 must cover: schema version, generic item type, migration, backup step, dev data mode.
4. `docs/WORKFLOW.md`: the step-by-step loop I follow for each phase, written for a non-expert: which commands to run, when to run `/clear`, how to test on my iPhone, how to check GitHub Actions, and how to merge to `main` at the end. Include how to restore from a `progress.json` backup.
5. `docs/prompts/generate-exercises.md`, `docs/prompts/verify-exercises.md`, `docs/prompts/grade-sentences.md`: ready to paste into other AI tools. Each file is the prompt only, with a short header on how to use it and which input file to attach. The generation prompt must produce the in-app test file format defined in DESIGN.md and support multiple non-overlapping variants per list.

Stop after writing these files. Summarize open questions in chat and wait for my answers before I start Phase 1.
