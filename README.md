# 習字 · TOCFL Tutor

A browser-based spaced-repetition tutor for **Taiwanese Mandarin**, aligned to the
**TOCFL** standard. Traditional characters and pinyin tone marks throughout — no
Zhuyin, no Simplified. It runs entirely in the browser, deploys free on GitHub
Pages, and syncs your progress across phone, tablet, and desktop by committing a
single `progress.json` file back to your own GitHub repo. **No backend, no
database, no login.**

## Features

- **FSRS spaced repetition** (`ts-fsrs`) — smarter scheduling than Anki's SM-2. Due cards surface first; rate yourself Again / Hard / Good / Easy.
- **Tone Curve Visualizer** (the flagship) — tap the mic, say the word, and the app runs the YIN pitch-detection algorithm (`pitchfinder`) over your recording frame-by-frame to extract your F₀ contour, then overlays it on the ideal contour for that tone (1 = flat high, 2 = rising, 3 = dip-and-rise, 4 = sharp fall). A shape-similarity score shows how close you are.
- **TTS playback** on every card in a `zh-TW` voice.
- **AI tutor** (Claude API) — tap to ask for example sentences, grammar, mnemonics, or Taiwan-vs-Mainland usage notes.
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
2. **Claude AI Tutor** — paste your Anthropic API key (`sk-ant-…`). Get one at
   <https://console.anthropic.com>.
3. **Study levels** — pick which TOCFL bands to study.

That's it. Study on your laptop, pick up on your phone on the bus — progress
follows you because it lives in the repo.

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
  data/vocab.js          TOCFL wordlist (Traditional, pinyin, band, tones)
  lib/
    fsrs.js              ts-fsrs scheduling wrapper
    pitch.js             YIN pitch detection + tone-shape scoring
    github.js            GitHub Contents API read/write
    claude.js            Claude API tutor calls
    speech.js            TTS + speech recognition (zh-TW)
  hooks/useProgress.js   state, localStorage, sync orchestration
  components/
    Flashcard.jsx        review surface: char, TTS, mic, tone curve, rating
    ToneCurve.jsx        Recharts pitch-contour overlay
    AITutor.jsx          Claude help panel
    Dashboard.jsx        stats + band mastery
    Settings.jsx         credentials + level selection
  App.jsx                routing + review loop
.github/workflows/deploy.yml   auto-deploy to GitHub Pages
```

## Browser notes

- The tone visualizer and TTS need a modern browser with Web Audio and
  SpeechSynthesis. On iOS Safari, audio/speech require a user tap to start
  (the mic and play buttons satisfy that).
- Speech **recognition** support varies; the tone curve does not depend on it.

## License

MIT — see `LICENSE`.
