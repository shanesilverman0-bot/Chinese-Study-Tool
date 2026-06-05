# 習字 · TOCFL Tutor

A browser-based spaced-repetition tutor for **Taiwanese Mandarin**, aligned to the
**TOCFL** standard. Traditional characters and pinyin tone marks throughout — no
Zhuyin, no Simplified. It runs entirely in the browser, deploys free on GitHub
Pages, and syncs your progress across phone, tablet, and desktop by committing a
single `progress.json` file back to your own GitHub repo. **No backend, no
database, no login.**

## Features

- **FSRS spaced repetition** (`ts-fsrs`) — smarter scheduling than Anki's SM-2. Due cards surface first; rate yourself Again / Hard / Good / Easy. **The rating buttons are always visible** — if you know a word from memory you can rate it immediately without revealing the answer. The answer is there to peek at only if you want it.
- **Tone Curve Visualizer** (the flagship) — tap the mic, say the word, and the app runs the YIN pitch-detection algorithm (`pitchfinder`) over your recording frame-by-frame to extract your F₀ contour, then overlays it on the ideal contour for that tone (1 = flat high, 2 = rising, 3 = dip-and-rise, 4 = sharp fall). A shape-similarity score shows how close you are. Recording uses `MediaRecorder` + `decodeAudioData` for broad browser support, and there's a **mic diagnostics panel** in Settings if anything misbehaves.
- **TTS playback** on every card in a `zh-TW` voice.
- **AI tutor** — tap to ask for example sentences, grammar, mnemonics, or Taiwan-vs-Mainland usage notes. Choose **Claude or DeepSeek** as the provider in Settings.
- **In-browser file manager** — browse, upload, create folders in, and delete files from your repo without leaving the app (檔案 / Files tab).
- **Runtime vocab packs** — drop `.json` wordlists into a `vocab/` folder and the app auto-loads them. See `VOCAB_PACK_GUIDE.md` for the format (hand that file to an AI to generate packs).
- **Progress dashboard** — due today, learned, retention, streak, and TOCFL band mastery.
- **Level selector** — study Novice / Band A / B / C as you progress.
- **Cross-device sync** via the GitHub Contents API.

## Tech stack

React + Vite + Tailwind CSS · `ts-fsrs` · `pitchfinder` (YIN) + Web Audio API ·
Recharts · Web Speech API (`zh-TW`) · Claude API (`claude-sonnet-4-20250514`) ·
GitHub Pages + GitHub Contents API.

## Quick start

### 1. Fork / create the repo

Fork this repository (or push it to a new repo of your own). The app reads and
writes its `progress.json` to **a** GitHub repo — it can be this same one.

### 2. Enable GitHub Pages

In your repo: **Settings → Pages → Build and deployment → Source: GitHub Actions.**
The included workflow (`.github/workflows/deploy.yml`) builds on every push to
`main` and publishes the `/docs` output. Your app will be live at
`https://<your-username>.github.io/<repo-name>/`.

### 3. Run locally (optional)

```bash
npm install
npm run dev      # local dev server
npm run build    # outputs static site to /docs
```

### 4. Create a GitHub Personal Access Token (for sync)

You need a token that can write `progress.json`:

- **Fine-grained token** (recommended): GitHub → Settings → Developer settings →
  Fine-grained tokens. Grant access to your repo only, with
  **Contents: Read and write**.
- **Classic token**: scope `repo`.

### 5. Configure the app

Open the deployed app → **設定 / Settings**:

1. **GitHub Sync** — paste your token, owner (username), repo name, branch
   (`main`), and path (`progress.json`). Hit **Test connection**, then **Pull**.
2. **AI Tutor** — pick your provider:
   - **Claude**: paste your Anthropic key (`sk-ant-…`) from <https://console.anthropic.com>. Works directly from the browser.
   - **DeepSeek**: paste your DeepSeek key and (optionally) a model id (`deepseek-chat`, `deepseek-reasoner`, or the newer `deepseek-v4-flash`/`deepseek-v4-pro`). **Caveat:** DeepSeek's own docs recommend calling their API from a server, not a browser, so a direct call from GitHub Pages may be blocked by CORS. If you hit a CORS/network error, either use Claude, or route the request through a small proxy (see *DeepSeek & CORS* below).
3. **Study levels** — pick which TOCFL bands to study.

That's it. Study on your laptop, pick up on your phone on the bus — progress
follows you because it lives in the repo.

## Managing files & vocab in the browser

The **檔案 / Files** tab is a file manager for your synced repo. You can:

- Browse folders and files
- Upload files (multi-select supported) — great for vocab packs
- Create folders
- Delete files (asks for confirmation; commits a deletion to your repo)

### Adding vocabulary

The app ships with a curated seed list and also auto-loads **vocab packs**:
any `.json` file inside a `vocab/` folder in your repo. An example pack lives at
`vocab/example-band-b-extra.json`. To add your own:

1. Generate a pack JSON following **`VOCAB_PACK_GUIDE.md`** (hand that guide to
   Claude or DeepSeek in a prompt and it'll produce a conformant file).
2. Upload it into `vocab/` via the Files tab (or commit it on GitHub).
3. The app loads it on next sync; Settings → Vocabulary shows how many words
   each pack added.

Words are deduped by character, so re-uploading or overlapping packs won't
clobber your review history.

## DeepSeek & CORS

Browsers block cross-origin requests unless the server opts in with CORS
headers, and DeepSeek's API isn't intended for direct browser use. If you want
DeepSeek from the deployed Pages app, run a tiny proxy that adds CORS headers
(e.g. a Cloudflare Worker or any serverless function) and forwards to
`https://api.deepseek.com/chat/completions`, then point the app at it. Claude's
API supports the browser-access header and works without a proxy.

## How sync works

On load, the app fetches `progress.json` via the GitHub Contents API. After each
review it debounces and commits the updated file back (using the file's `sha`
for in-place updates). Settings and a local copy of progress are also cached in
`localStorage`, so the app still works offline and simply re-syncs when GitHub is
reachable.

## Privacy

Your GitHub token and Claude key are stored **only in your browser's
localStorage** and are sent directly to GitHub and Anthropic respectively. They
are never sent anywhere else. Because Claude is called directly from the browser,
the request uses Anthropic's `anthropic-dangerous-direct-browser-access` header.

## Vocabulary data

A curated TOCFL starter set ships in `src/data/vocab.js` (Traditional + pinyin
tone marks + English + band + per-syllable tones). To load a fuller list, import
CSV data from the [`ivankra/tocfl`](https://github.com/ivankra/tocfl) or
`nutchanonj/TOCFL_14425_vocab_list` repos into the same shape and extend that
array.

## Project structure

```
src/
  data/vocab.js          TOCFL seed wordlist (Traditional, pinyin, band, tones)
  lib/
    fsrs.js              ts-fsrs scheduling wrapper
    pitch.js             MediaRecorder capture + YIN pitch detection + scoring + diagnostics
    github.js            GitHub Contents API: progress sync + file manager ops
    tutor.js             AI tutor (Claude + DeepSeek providers)
    speech.js            TTS + speech recognition (zh-TW)
    vocab.js             runtime vocab-pack loader + pinyin->tone derivation
  hooks/useProgress.js   state, localStorage, sync orchestration
  components/
    Flashcard.jsx        review surface: char, TTS, mic, tone curve, always-on rating
    ToneCurve.jsx        Recharts pitch-contour overlay
    AITutor.jsx          AI help panel
    Dashboard.jsx        stats + band mastery
    Settings.jsx         credentials, provider, levels, vocab info, mic test
    MicTest.jsx          audio diagnostics + live level meter
    RepoFiles.jsx        in-browser GitHub file manager
  App.jsx                routing, review loop, vocab loading
vocab/                   drop .json vocab packs here (auto-loaded)
VOCAB_PACK_GUIDE.md      schema for generating vocab packs with an AI
.github/workflows/deploy.yml   auto-deploy to GitHub Pages
```

## Browser notes

- The tone visualizer and TTS need a modern browser with Web Audio and
  SpeechSynthesis. On iOS Safari, audio/speech require a user tap to start
  (the mic and play buttons satisfy that).
- Speech **recognition** support varies; the tone curve does not depend on it.

## License

MIT — see `LICENSE`.
