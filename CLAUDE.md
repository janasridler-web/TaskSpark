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
Current release: V4.1.1.

> **Roadmap for the next phases lives in `next-phases.md`.** Read it before
> starting new architectural work — it captures what we decided to do
> next (Mac via Electron-wraps-web, then reminders), what we deliberately
> rejected, and which backlog items have been superseded.

### Architecture

- `src/main.template.js` — Electron main process. Committed with credential
  placeholders (`__APP_CLIENT_ID__` etc.).
- `src/main.js` — **gitignored**. Generated from the template by `setup.js`,
  which reads real credentials from `.env`. Runs automatically before
  `npm start` (prestart hook). Any changes to `main.template.js` require a
  fresh `node setup.js` run (or `npm start`) before testing locally.
- `src/app.js` — renderer (UI logic, ~7900 lines). **Planned for deletion**
  once Phase 2 wrapped-web flow has been stable for ≥ 2 weeks (see
  `next-phases.md`). Don't burn cycles improving it.
- `src/preload.js` — IPC bridge. Exposes the legacy `window.api` (used by
  `src/app.js`) and the new Phase 2 `window.desktopAPI` (used by the
  wrapped web app). The legacy surface is suppressed entirely when
  `TASKSPARK_USE_WEB=1` is set, because `web/app.js` declares its own
  top-level `const api` that would otherwise collide.
- `src/index.html` — main window shell; all views are shown/hidden in here.
  Also planned for deletion alongside `src/app.js`.
- `web/index.html` + `web/app.js` — canonical renderer post-Phase-2.
  Already loaded by the wrapped desktop when `TASKSPARK_USE_WEB=1`.
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
in the same commit that ships the web build** — a comment in `sw.js`
reminds you. If only one changes, the upgrade trap (stale cached HTML/JS)
comes back.

**Don't bump these proactively.** Editing `web/app.js`, `web/index.html`,
or `web/sw.js` does NOT mean "bump now" — staging auto-deploys only from
`claude/rebuild-web-companion-v4-3MuP2` (see "Deploy" below), and
production is manual-dispatch. Wait until Jana explicitly says she's
deploying / publishing / shipping the web companion, then bump in the
deploy commit. Multiple un-shipped bumps in a feature branch is just
version-history noise.

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

- Companion (pure web, not wrapped) has no AI Task Breakdown Helper, no
  custom break sound file picker, no global keyboard shortcuts, no offline
  mode, no auto-updater (the refresh banner fills that role), and no
  Budget view. It *does* have Outlook calendar integration and CSV export.
  See `features.md` for the full split. The wrapped desktop (Phase 2)
  layers desktop-only features back on via `window.desktopAPI`.
- iOS Safari renders some Unicode glyphs (☑, 💡, 🔄, ⚠) as colour emoji even
  with `font-feature-settings`. Use plain text glyphs (☰, ❋, ⊕, ✪, !, ▤,
  coloured ●) on the mobile drawer/nav to keep parity with the desktop
  sidebar.
- iOS native `<input type="time">` has an intrinsic min-width that breaks
  flex/grid. Strip it with `appearance: none` plus explicit padding /
  min-height.
- Modals on iOS need `100dvh` (not `vh`) and an explicit `scrollTop = 0` on
  open or the URL bar will hide the title.

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

