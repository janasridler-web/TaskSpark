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

## Features documentation

`features.md` is the source-of-truth list of every TaskSpark feature, grouped
to match the seven settings tabs plus onboarding / web-only / desktop-only
sections. Each feature is tagged with platform (Desktop / Companion / Both)
and version (V3.5 or V4.0.0).

**When you add, remove, or substantially change a feature, update
`features.md` in the same change.** Settings (toggles) are not features and
do not belong in this file — only the capabilities the settings turn on or
shape.

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

## Web companion

The companion lives in `web/` and is a single-file SPA — `web/app.js`
(~7,800 lines) plus `web/index.html`. It ships as a PWA with a versioned
service worker (`web/sw.js`).

> **Two reference docs live alongside this file:**
> - `WEB-WORKFLOW.md` — plain-English walkthrough of the change-and-deploy
>   loop (staging auto-deploy, manual live, when to bump versions, how to
>   force a staging refresh). Read this first when working on the web app.
> - `WEB-DEPLOY.md` — terser reference: going-live procedure, OAuth
>   redirect URIs, manual cPanel fallback, optional gzip `.htaccess`.

### Versioning

`WEB_VERSION` lives at the top of `web/app.js`. The service worker's
`CACHE_NAME` lives at the top of `web/sw.js`. **Both must be bumped together
when shipping a new web build** — a comment in `sw.js` reminds you. If only
one changes, the upgrade trap (stale cached HTML/JS) comes back.

The service worker is network-first for HTML/JS and cache-first for icons /
audio. On activate it deletes any cache that isn't the current `CACHE_NAME`
and a `controllerchange` listener on the page side surfaces the
"TaskSpark has updated — refresh" banner.

### Mobile route (/m)

Phones hitting `app.taskspark.tech` are auto-redirected to `/m` by a small
script in `web/index.html`. The route is a flag, not a separate app:

- `web/m/index.html` redirects to `/?_m=1`.
- `app.js` reads the flag, sets `window.MOBILE_ESSENTIALS = true`, and
  `history.replaceState`s the URL back to `/m/` for cleanliness.
- `applyMobileEssentials()` adds `body.mobile-essentials`, swaps the nav for
  Tasks / Habits / + / Lists / More, and gates a few features.

A "Use full version" link in Settings → Account & Data overrides the
redirect.

### Deploy

- **Staging**: `staging.taskspark.tech` — auto-deploys on every push to the
  V4 rebuild branch via `.github/workflows/staging-web.yml`. Uses
  `STAGING_FTP_*` secrets. Excludes `**/assets/**` permanently because of
  historical file ownership on the assets folder (FTP user can't overwrite).
- **Production**: `app.taskspark.tech` — `.github/workflows/deploy-web.yml`,
  currently `workflow_dispatch:` only while the V4 rebuild is in flight. See
  `WEB-DEPLOY.md` for the going-live procedure and the manual cPanel
  fallback.

`.htaccess` and the `assets/` folder are managed in cPanel by hand — never
shipped via the workflow.

### Branches and PRs

- V4 web rebuild branch: `claude/rebuild-web-companion-v4-3MuP2`. Push only
  to this branch — never to `main`.
- The repo has branch protection on `main`; changes land via PR.

### Plain-language gotchas worth remembering

- Companion has no AI Task Breakdown Helper, no custom break sound, no global
  keyboard shortcuts, no offline mode, no auto-updater (the refresh banner
  fills that role), no Calendar / Budget / CSV export. See `features.md` for
  the full split.
- iOS Safari renders some Unicode glyphs (☑, 💡, 🔄, ⚠) as colour emoji even
  with `font-feature-settings`. Use plain text glyphs (☰, ❋, ⊕, ✪, !, ▤,
  coloured ●) on the mobile drawer/nav to keep parity with the desktop
  sidebar.
- iOS native `<input type="time">` has an intrinsic min-width that breaks
  flex/grid. Strip it with `appearance: none` plus explicit padding /
  min-height.
- Modals on iOS need `100dvh` (not `vh`) and an explicit `scrollTop = 0` on
  open or the URL bar will hide the title.

