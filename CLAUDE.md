# Working with Jana on TaskSpark

## Communication style

Jana is non-technical. Use plain English in all explanations:
- No jargon without a one-line plain-language gloss the first time it appears.
- Don't explain the implementation — explain what changed for the user and why.
- Short answers. Ask before doing anything large or destructive.

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

