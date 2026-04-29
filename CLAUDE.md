# Working with Jana on TaskSpark

## Communication style

Jana is non-technical. Use plain English in all explanations:
- No jargon without a one-line plain-language gloss the first time it appears.
- Don't explain the implementation — explain what changed for the user and why.
- Short answers. Ask before doing anything large or destructive.

## Working principles

### 1. Think before coding
Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity first
Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical changes
Touch only what you must. Clean up only your own mess.

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

### 4. Goal-driven execution
Define success criteria. Loop until verified.

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## Backlog convention

When Jana says "we'll do that later", "park that", "not now", "skip for now",
"add to backlog", or anything similar, **immediately add the item to
`backlog.md`** under the right severity heading (see the file for the format).
Don't ask — just add it and confirm in one line.

When an audit/review surfaces issues we don't fix in the current pass, the
unfixed items also go in `backlog.md`. When picking up backlog items later,
**delete them from the file when done** — git history is the record.

## Project context

TaskSpark is a Windows Electron desktop task manager for ADHD/AuDHD users.
Current release: V4.0.0.

### Architecture

- `src/main.template.js` — Electron main process. Committed with credential
  placeholders (`__APP_CLIENT_ID__` etc.).
- `src/main.js` — **gitignored**. Generated from the template by `setup.js`,
  which reads real credentials from `.env`. Runs automatically before
  `npm start` (prestart hook). Any changes to `main.template.js` require a
  fresh `node setup.js` run (or `npm start`) before testing locally.
- `src/app.js` — renderer (UI logic, ~7900 lines).
- `src/preload.js` — IPC bridge between main and renderer.
- `src/index.html` — main window shell; all views are shown/hidden in here.
- Cloud storage = Google Sheets (per workspace, multiple workspaces supported).
- Releases publish to a separate public repo `janasridler-web/taskspark-releases`
  via `electron-updater`.

Two-repo strategy: source code stays in this repo (planned to go private);
installer binaries published to the public releases repo so auto-update works.

### Timer / focus architecture (as of V4.0.0)

There are two separate timer UX modes:

**Without focus mode** (`settings.focusModeEnabled = false`):
- `timer.html` opens as a small always-on-top `BrowserWindow` (bottom-right corner).
- Main window minimizes.
- Stop button in `timer.html` sends IPC → main → `timer-stopped` event →
  `api.onTimerStopped()` in `app.js` saves elapsed time and resets state.

**With focus mode** (`settings.focusModeEnabled = true`):
- `#focus-overlay` div inside `index.html` is shown (full-viewport, z-index 820).
- No separate window is opened. Main window stays visible and unminimized.
- Stop button calls `stopTimer()` in `app.js` directly, which saves elapsed
  time, resets all timer state, saves tasks, and re-renders.
- Break prompt (z-index 850) still appears on top of the focus overlay
  when a break is due.

`stopTimer()` is the canonical "user clicked stop" function — it does a full
save-and-cleanup. `stopTimerSave()` is used internally when switching tasks.

### Build and release

- Build workflow: `.github/workflows/build.yml` — **manual trigger only**.
- Release workflow: `.github/workflows/release.yml` — **manual trigger only**.
- Pushing to `main` does NOT trigger a build automatically.
- Branch protection on `main` requires changes via pull request.

### Testing before release

**Pulling Claude's changes to your machine:**
After Claude pushes a change to a feature branch, you need to pull it locally before you can test:
1. `git fetch origin` — get the latest branch info
2. `git checkout <branch-name>` — switch to the branch Claude pushed (Claude will tell you the name)
3. `git pull origin <branch-name>` — pull the new commits
4. After the PR is merged, switch back: `git checkout main` then `git pull origin main`

If `package-lock.json` complains about conflicts on pull (common after dependency updates), run:
- `git checkout -- package-lock.json`
- `git pull`
- `npm install`

**Note for Claude:** Jana is non-technical — when telling her to pull a branch, give the exact git commands to copy/paste, not just the branch name.

**Testing a code change locally:**
1. Make sure you've pulled the latest branch (see above)
2. Run `npm start` — this automatically regenerates `src/main.js` with your credentials then launches the app
3. Test the change manually in the running app
4. If `main.template.js` was changed, always run `npm start` (or `node setup.js`) before testing — the old `main.js` won't have the new code

**Testing a build without publishing:**
- Go to **Actions → Build App → Run workflow** on GitHub
- This builds the installer and saves it as a downloadable artifact (without touching the releases repo)
- Use this to confirm the build succeeds and the installer works before running the release workflow

**The release staging flow:**
- The release workflow creates a **draft** release on `taskspark-releases` — it is NOT live to users until you manually click "Publish release" on GitHub
- Always download and install the draft installer on your machine before publishing
- Once published, existing users are notified automatically on next launch

**Branch → PR → main:**
- All changes go on a feature branch, then into `main` via a pull request
- `main` has branch protection — direct pushes are rejected by GitHub
- Always ask Claude to work on a branch and open a PR, not push directly to `main`

