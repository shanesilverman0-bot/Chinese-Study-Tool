# WORKFLOW — how to run each phase (for Shane)

You run these steps. Claude Code does the coding inside each phase. Commands go in the macOS **Terminal** app. Paste them one block at a time.

---

## 1. One-time setup (do once, before Phase 0)

### Step 0 — Why this is needed
The folder `~/Desktop/Chinese-Study-Tool-2-update` is **not** a git repository. Your whole home folder (`/Users/shanesilverman`) is one, with this project as its remote, and its `main` is out of date. A careless `git add -A` there would stage your personal files (driver's license scan, E*TRADE PDF, and so on). So we make a clean, separate copy of the project and only ever work there.

Optional but recommended: turn off the home-folder repository so no tool uses it by accident. This renames its hidden `.git` folder and deletes nothing:
```bash
mv ~/.git ~/.git-home-repo-disabled
```
(Undo with `mv ~/.git-home-repo-disabled ~/.git`.)

### Step 1 — Back up your live progress (your safety net)
```bash
mkdir -p ~/Documents/tocfl-backups
curl -L -o ~/Documents/tocfl-backups/progress-$(date +%Y%m%d).json https://raw.githubusercontent.com/shanesilverman0-bot/Chinese-Study-Tool/main/progress.json
ls -lh ~/Documents/tocfl-backups
```
You should see a file of about 2–3 MB. Repeat this before every merge to `main`. After the cutover the file is private, so back up with `cd ~/Desktop/Chinese-Study-Data && git pull && cp progress.json ~/Documents/tocfl-backups/progress-$(date +%Y%m%d).json` instead.

### Step 2 — Make a clean clone on the v2 branch
```bash
cd ~/Desktop
git clone https://github.com/shanesilverman0-bot/Chinese-Study-Tool.git Chinese-Study-Tool-v2
cd ~/Desktop/Chinese-Study-Tool-v2
git switch v2-update
git rev-parse --show-toplevel
```
The last line must print `/Users/shanesilverman/Desktop/Chinese-Study-Tool-v2`. From now on, **this** folder is the project.

### Step 3 — Copy the design docs in and push them
```bash
cd ~/Desktop/Chinese-Study-Tool-v2
OLD=~/Desktop/Chinese-Study-Tool-2-update
cp "$OLD/CLAUDE.md" .
cp "$OLD"/docs/*.md docs/
mkdir -p docs/prompts docs/samples
cp "$OLD"/docs/prompts/*.md docs/prompts/
cp "$OLD/docs/samples/pleco-sample.xml" docs/samples/
git add CLAUDE.md docs/*.md docs/prompts docs/samples
git commit -m "Add v2 design docs, phase specs, prompts"
git push origin v2-update
```
If `git push` asks for a password, GitHub wants a **personal access token**, not your password. You can paste the same kind of token the app uses (it needs "Contents: read and write" on this repo).

### Step 4 — Install
```bash
cd ~/Desktop/Chinese-Study-Tool-v2
npm install
```
Don't run `npm run build` yet. Until Phase 0 is done, a build erases the `docs/` folder.

### Step 5 — Create the private data repo (where your progress will live)
Your progress, sentences and exercises move to a **private** repo. The app (public) keeps serving the website for free. Dev builds write to a `dev/` folder inside the data repo and never touch the live file.

1. On github.com: **+** (top right) → **New repository** → name `Chinese-Study-Data` → choose **Private** → tick **Add a README file** → **Create repository**.
2. Make a token the app can use, limited to this repo only: github.com → your avatar → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**. Name it `tocfl-app`. Expiration: 1 year. **Repository access → Only select repositories → Chinese-Study-Data**. **Permissions → Repository permissions → Contents → Read and write**. Generate it and copy it into your password manager. You will paste it into the app's Settings on each device (and dev address).
3. Put a copy of your current progress in as test data:
```bash
cd ~/Desktop
git clone https://github.com/shanesilverman0-bot/Chinese-Study-Data.git
cd ~/Desktop/Chinese-Study-Data
mkdir -p dev
curl -L -o dev/progress.json https://raw.githubusercontent.com/shanesilverman0-bot/Chinese-Study-Tool/main/progress.json
git add dev/progress.json
git commit -m "Add test copy of progress"
git push
```
If `git push` asks for a password, paste a token. This one needs access to Chinese-Study-Data; the app token from step 2 works.

The **live** `progress.json` is copied in later, at the first merge (section 8, "Cutover"). Until then, your real studying on the github.io site keeps working exactly as today.

---

## 2. The loop for each phase

1. **Open the project in Claude Code** with a fresh conversation:
   - Terminal: `cd ~/Desktop/Chinese-Study-Tool-v2` then `claude`. Choose the model with `/model` (pick **Sonnet** unless the phase table says otherwise).
   - Or the desktop app: open the folder `Chinese-Study-Tool-v2` and pick the model in the model menu.
2. **Paste the phase's "Session prompt"** from `docs/PHASES.md`. Nothing else.
3. Let it work. Approve file edits and commands when asked. If it asks a design question the spec doesn't answer, answer it, then ask it to add your answer to `docs/RISKS.md` under "Implementation notes".
4. When it says it pushed, **check GitHub Actions** (section 5).
5. **Test it yourself** using the phase's "Acceptance checks". Use the Mac browser for "Console" checks and the phone for "Phone" checks (section 4).
6. If a check fails: in the **same** conversation, paste what you saw (the screen text or the console error). Let it fix, build, commit and push again.
7. If the phase table says **Opus review: Yes**: start a new conversation (`/clear`), switch to Opus (`/model opus`), and paste the review prompt from the top of `PHASES.md`.
8. Run `/clear` (or start a new conversation) before the next phase.

### When to use `/clear`
- After each phase is pushed, CI is green, and you've checked it.
- Before an Opus review.
- **Not** in the middle of a phase. If Claude warns that the conversation is getting long mid-phase, say: *"Commit and push what builds now as 'WIP Phase N', then stop."* Then `/clear` and paste the session prompt plus: *"Continue Phase N from where the last commit stopped."*

### Quick status commands (safe, read-only)
```bash
git status
```
```bash
git log --oneline -5
```
```bash
git branch --show-current
```
The branch must say `v2-update`.

---

## 3. Running the app on the Mac

```bash
npm run dev
```
Open http://localhost:5173. An **amber "DEV DATA" bar** at the top means you are on test data. The first time (from Phase 1A on), open Settings → Data repo and paste your `tocfl-app` token. Owner `shanesilverman0-bot` and repo `Chinese-Study-Data` are filled in, and the file shows `dev/progress.json`. Stop the server with `Ctrl+C`.

To see the console: Chrome → View → Developer → JavaScript Console. Type `__tt` and press Enter.

No GitHub at all (pure local test): `npm run dev:offline` (grey "LOCAL ONLY" bar).

---

## 4. Testing on your iPhone

1. The Mac and the iPhone must be on the **same Wi-Fi**.
2. Find the Mac's local name: System Settings → General → Sharing → "Local hostname" (something like `Shanes-MacBook-Air.local`).
3. On the Mac (available from Phase 1A onward):
   ```bash
   npm run dev:phone
   ```
4. On the iPhone in Chrome, open `https://Shanes-MacBook-Air.local:5173` (use your hostname). Chrome warns "Your connection is not private". That is the dev certificate: tap **Advanced → Proceed**. If Chrome won't let you through, use Safari for testing. It uses the same engine as Chrome on iPhone.
5. Check for the amber **DEV DATA** bar. If it's missing, **stop**: you are not on the dev build.
6. The first time on this address, enter the GitHub token in the app's Settings. The phone stores it separately for this address.
7. Keep using the real app at the normal github.io address for your actual study. Until a merge, it doesn't change.

Phase 16 (microphone) needs this https address; the mic doesn't work over plain http.

---

## 5. Checking GitHub Actions

1. Go to https://github.com/shanesilverman0-bot/Chinese-Study-Tool/actions
2. In the left list click **CI** (it exists after Phase 0), then find the newest run for branch `v2-update`.
3. Green check = good. Yellow dot = still running (wait 1–2 minutes). Red X = failed: click it → click the `build` job → scroll to the red step → copy the error lines → paste them into Claude Code: *"CI failed with this error: … Fix it, build, commit and push."*

"Deploy to GitHub Pages" runs only for `main`. You should not see it run for `v2-update` pushes.

---

## 6. Undoing a bad phase

Never use `git push --force`. To undo the last commit on `v2-update` safely:
```bash
git revert --no-edit HEAD
git push origin v2-update
```
It creates a new commit that reverses the bad one. Or ask Claude Code: *"Revert the last commit with git revert and push."*

---

## 7. Refreshing the test data with your latest real progress

Do this when the dev copy is too old to test meaningfully.

Before the cutover (live data still in the app repo):
```bash
cd ~/Desktop/Chinese-Study-Data
git pull
curl -L -o dev/progress.json https://raw.githubusercontent.com/shanesilverman0-bot/Chinese-Study-Tool/main/progress.json
git commit -am "Refresh dev data from live"
git push
```
After the cutover (live data in the data repo):
```bash
cd ~/Desktop/Chinese-Study-Data
git pull
cp progress.json dev/progress.json
git commit -am "Refresh dev data from live"
git push
```
On each test device, then press Settings → Pull in the dev app (or use Settings → Data → Restore from file).

---

## 8. Merging to `main` (going live)

A **milestone** is a point where a group of finished phases is worth putting on the real site. You test on the dev build, then merge `v2-update` into `main` once, and the github.io site updates. Planned milestones: after Phase 5 (dashboard), 9 (Pleco), 14 (context) and 16 (tone trainer). Each merge publishes everything done so far. Between milestones, the real site doesn't change.

### Cutover (first merge only): move live data to the private repo
Do these between steps 3 and 5 below, the first time only:
```bash
cd ~/Desktop/Chinese-Study-Data
git pull
curl -L -o progress.json https://raw.githubusercontent.com/shanesilverman0-bot/Chinese-Study-Tool/main/progress.json
git add progress.json
git commit -m "Cutover: live progress moves to the private data repo"
git push
```
Then on `v2-update`, ask Claude Code: *"Remove progress.json from the app repo with git rm, commit 'Cutover: progress now lives in Chinese-Study-Data', and push."* After the merge, every device needs the `tocfl-app` token pasted into Settings → Data repo once (the old token field is replaced).

The old public `progress.json` stays visible in the app repo's git **history** (review data only: words and dates). Purging it is possible but rewrites history; ask if you want that later.

### Steps

1. **Check the Pages setting once:** GitHub → repo → Settings → Pages → "Build and deployment → Source" must be **GitHub Actions**. If it says "Deploy from a branch", stop and ask Claude (Phase 0 moved the build out of `docs/`).
2. **Back up live progress** (section 1, step 1). Check the file has today's date and a sensible size.
3. **Stop studying on all devices.** Close the app tabs on the laptop and phone.
4. **Check CI is green** on the latest `v2-update` commit.
5. **Open a pull request:** go to https://github.com/shanesilverman0-bot/Chinese-Study-Tool/compare/main...v2-update → **Create pull request** → title "v2: phases 0–N" → **Create pull request** → wait for checks → **Merge pull request** → **Confirm merge**. Do not delete the `v2-update` branch.
6. **Watch the deploy:** Actions → "Deploy to GitHub Pages" for `main` → wait for green (about 2 minutes).
7. **On the iPhone**, open the normal github.io address, reload twice, and check there is **no** DEV bar. Paste the token in Settings → Data repo (first time). Settings → Data shows `Chinese-Study-Data:progress.json`. Rate one card. In Chinese-Study-Data you should see `backups/progress-pre-v3-….json` (first v2 merge only) and then a progress commit. The app repo gets no commit.
8. **On every other device** (laptop, iPad), reload the app once before studying there. An old open tab can overwrite newer data.
9. Keep going: the next phase still happens on `v2-update`, and you open a new pull request at the next milestone.

### If the live site breaks after a merge
GitHub → Pull requests → Closed → your v2 PR → **Revert** → Create pull request → Merge. The old app redeploys in about 2 minutes. Your data is safe: the old app keeps the new fields it doesn't understand.

---

## 9. Restoring `progress.json` from a backup

Where backups live:
- `~/Documents/tocfl-backups/` (your manual downloads)
- `backups/` folder in Chinese-Study-Data (automatic, written before the v3 upgrade and before every in-app restore)
- every older version of `progress.json` in Chinese-Study-Data's git history (each study save is a commit); before the cutover, in the app repo's history

### A. Normal way, from inside the app (preferred)
1. Get the backup file onto the device. For a backup on GitHub: open it on github.com → **Download raw file** (the ⤓ icon). For an older version: open `progress.json` on github.com → **History** → pick a commit from before the problem → `…` → **View file** → **Download raw file**.
2. App → Settings → 資料 · Data → **Restore from file…** → pick the file.
3. Check the summary (cards, reviewed, last updated) → type `RESTORE` → confirm. The app saves a backup of the current file first, then replaces it.
4. On **each other device**: do the same restore with the same file before studying, so their older local copy isn't merged back in.

### B. Emergency way, when the app won't load
```bash
cd ~/Desktop/Chinese-Study-Data
git pull
cp ~/Documents/tocfl-backups/progress-YYYYMMDD.json progress.json
git commit -am "Restore progress.json from backup"
git push
```
(Replace `YYYYMMDD` with the file's date. Before the cutover, do the same in the app repo on `main` instead. You may push there; Claude may not.) Then on each device, open the app and do method A with the same file, so the device's local copy matches.
