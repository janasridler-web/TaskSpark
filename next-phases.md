# TaskSpark — Next Phases (post V4.1.1)

This file is a handoff for the next development sessions. It captures the
plan, the decisions already made, and the things still up for grabs. Keep
this file in sync as you go — when a phase ships, summarise it in
`CHANGELOG.md` and trim what's done out of here.

Last updated: 2026-05-10 (Phase 2 slices 1–9 landed behind the
`TASKSPARK_USE_WEB` flag).

---

## Where we are

- **V4.1.1 shipped on both desktop and web** with four trust fixes
  (B50/B51/B52/B53). See the V4.1.1 entry in `CHANGELOG.md`.
- **Phase 2 is in flag-gated testing.** `TASKSPARK_USE_WEB=1 npm start`
  loads `web/index.html` inside Electron with the full V4.1.1 feature
  set bridged through `window.desktopAPI`. Default (flag off) is
  unchanged. Branch: `claude/review-taskspark-docs-jzR1T`.
- **Desktop and web are still two ~8,500-line copies.** They share schema
  (Tasks sheet now goes A → AG, 33 columns) but the renderer is duplicated.
  `src/app.js` + `src/index.html` get deleted at the end of Phase 2.
- **Apple Developer Program is paid for** ($99/yr). Windows code-signing is
  intentionally **not** paid for — desktop installer ships unsigned, with
  SmartScreen friction on first install. Re-evaluate later.
- **Mac is a real near-term target** and Jana has a Mac for testing.

## The architectural decision

We picked **Option C — the web app is canonical, Electron wraps it.**

This is the same pattern Linear, Notion, Slack, Discord, Obsidian, Cursor
all use. One renderer codebase (`web/app.js` + `web/index.html`), with a
thin Electron shell that adds desktop-only capabilities through an IPC
bridge.

We **rejected Option B** (extract a shared `core/` folder) because Mac
makes the duplication problem worse, not better — three copies would drift
faster than two. Going straight to Option C is the right move.

After Phase 2 lands, `src/app.js` and `src/index.html` get **deleted**.
Don't burn cycles "improving" them in the meantime.

---

## Phase 2 — Migrate Windows to wrap the web app

**Goal:** the Windows desktop app loads `web/index.html` + `web/app.js` in
a `BrowserWindow` and adds desktop-only features through a `window.desktopAPI`
bridge. Feature parity with V4.1.1 desktop. No user-visible regressions.

**Estimated effort:** 3–4 weeks.

**Why first, before Mac:** doing the migration with only Windows in
production is much safer. Mac being added later is then mostly build-config
+ Mac-specific polish.

### Files involved

- `src/main.template.js` — Electron main. Will load `web/index.html` instead
  of `src/index.html`. Generated into `src/main.js` by `setup.js` (gitignored).
- `src/preload.js` — IPC bridge. Will be expanded to expose
  `window.desktopAPI` to the web app.
- `src/app.js` and `src/index.html` — **deleted at the end of the phase.**
- `web/app.js` — gains `if (window.desktopAPI)` checks for desktop-only paths.
- `web/index.html` — picks up any layout differences (e.g. frameless title
  bar) that were previously only in `src/index.html`.

### Step-by-step plan

Order matters here — each step keeps the desktop app shippable.

1. **Stand up the bridge skeleton.** ✅ **Done.** `TASKSPARK_USE_WEB=1`
   loads `web/index.html` in Electron with a native frame. `window.desktopAPI`
   exposed via `src/preload.js`. The legacy `window.api` is suppressed in
   that mode (`web/app.js`'s top-level `const api` would collide).

2. **Move features behind the bridge, one at a time.** ✅ **Done (slices 1–9).**
   The branch covers feature parity with V4.1.1 desktop:
   1. **Window memory + native chrome** — main loads `web/index.html`,
      restores saved bounds, switches to OS frame (web app has no custom
      title bar).
   2. **Auto-updater** — `desktopAPI.onUpdateAvailable / onUpdateDownloaded /
      installUpdate`. Banner copy swaps based on `window.desktopAPI`:
      "v{X} is ready — close the app to install, or click below" +
      "Install now" button under the wrap; the original
      "refresh to get the latest" + Refresh button on pure web.
   3. **Quick Add global shortcut** — `desktopAPI.onGlobalQuickAdd`. Main
      already registers Ctrl+Space (Ctrl+Shift+Space fallback); just
      bridged the event.
   4. **Floating timer window** — reuses `src/timer.html` +
      `src/timer-preload.js` (self-contained, no `window.api` dependency).
      `startTimer` branches on `desktopAPI` so the floating window only
      appears when wrapped + focus mode off.
   5. **Break prompt window** — reuses `src/break-prompt.html` +
      `src/break-prompt-preload.js`. Same shape as the timer.
   6. **CSV export** — no bridge needed. The web's Blob + `<a download>`
      flow works as-is inside Electron.
   7. **Custom break sound + file picker** — `desktopAPI.pickSoundFile`.
      Web app plays via `new Audio('file:///' + path)` (same as V4.1.1).
   8. **Outlook calendar OAuth** — `desktopAPI.outlookStart / outlookExchange /
      outlookRefresh`. `connectOutlook` + `refreshOutlookToken` branch on
      `desktopAPI` so the wrapped flow uses the loopback PKCE pattern
      instead of `window.open` + `file://auth-outlook.html`.
   9. **Persistent storage** — bridged `loadConfig / saveConfig / loadCache /
      saveCache / getVersion` so the wrapped app reads/writes the same
      `userData/config.json` + `tasks_cache.json` as V4.1.1 desktop.
      Wider than the original "cache only when offline" plan — see commit
      message. Means existing users won't need to re-sign-in or
      reconfigure when we flip the flag, and offline-mode users keep
      their local-only tasks.

3. **Delete `src/app.js` and `src/index.html`.** Pending. Only after a
   stable beta release on the new architecture (suggest ≥ 2 weeks of
   running with the flag on by default).

4. **Flip the flag default to on, then remove the flag entirely.** The
   `TASKSPARK_USE_WEB` env-var gate gets retired alongside step 3.

5. **Remove `if (window.desktopAPI)` boilerplate where it accumulates.**
   Some features can collapse to a single call once the flag is gone and
   web/wrapped are the only two targets. Cosmetic.

### Risk areas

- **Beta channel.** Worth setting up a separate `beta` release channel in
  `electron-updater` so you can ship the new architecture to volunteers
  before promoting it to stable.
(The Calendar OAuth and offline-mode risk areas the original plan flagged
are resolved by slices 8 and 9 respectively. The update-banner copy
issue is resolved by the banner-copy fix in `showUpdateBanner`.)

### Done when

- ✅ Windows desktop app launches `web/index.html` and all V4.1.1 features
  work, including: floating timer, break prompt, Quick Add, auto-updater,
  calendar sync, CSV export, custom break sound, offline mode, multi-monitor.
  (Functionality wired; needs manual smoke-test before flipping default.)
- ☐ Flag flipped to on-by-default for ≥ 2 weeks without regressions.
- ☐ `src/app.js` and `src/index.html` are deleted from the repo.
- ☐ `CHANGELOG.md` describes the migration in user-facing terms (mostly:
  "general stability and architecture work — no user-visible changes").

---

## Phase 3 — Add Mac as a build target

**Goal:** ship a notarised Mac `.dmg` of TaskSpark with auto-update working.

**Estimated effort:** 1–2 weeks. Most of the cost is Mac-feel polish, not
new logic.

**Prerequisites:**
- Phase 2 is complete and stable.
- Apple Developer Program membership is active (already paid for).
- A Mac is available for build + smoke-testing (Jana has one).

### Step-by-step plan

1. **Generate signing assets.**
   - Apple Developer portal → create a **Developer ID Application**
     certificate. Install it in the Mac's Keychain.
   - Create an **app-specific password** (or API key for `notarytool`).
     Add as a GitHub Actions secret.

2. **Update `package.json` build config:**
   - Add `mac.target: ['dmg', 'zip']` (zip is required by electron-updater
     for Mac auto-update; dmg is what users install).
   - Set `mac.category: 'public.app-category.productivity'`.
   - Set `mac.identity` to the Developer ID Application cert name.
   - Set `mac.hardenedRuntime: true` and `mac.entitlements` if you need any.
   - Add `afterSign` hook for notarisation (`electron-notarize` or
     `@electron/notarize`).

3. **Convert assets:**
   - Generate a `.icns` icon from existing `assets/icon.png` (use
     `iconutil` on Mac or an online converter).
   - Optional: design a `.dmg` background image (480×320 or so) showing
     "Drag TaskSpark to Applications".

4. **Mac-specific UI in the web app:**
   - Detect Mac via `window.desktopAPI.platform === 'darwin'`.
   - Hide the custom Win/Min/Close buttons; rely on native traffic lights
     by setting `titleBarStyle: 'hiddenInset'` in main.
   - Native menu bar — Electron's `Menu.setApplicationMenu` with File /
     Edit / View / Window / Help. The default Electron Mac menu template
     covers most of this.
   - `Cmd` not `Ctrl` for shortcuts. Electron's accelerator strings use
     `CmdOrCtrl` which handles this automatically.
   - **Do not register `Cmd+Space`** — that's Spotlight. Use
     `Cmd+Shift+Space` for Quick Add on Mac.
   - System dark-mode follow: read `nativeTheme.shouldUseDarkColors` in main,
     send via bridge; web app respects it if no manual override is set.

5. **Mac auto-update channel:**
   - electron-updater handles this with the same `latest-mac.yml` pattern.
   - Make sure the release workflow uploads `latest-mac.yml` + the
     `.zip` (auto-update can't use `.dmg` directly) alongside the existing
     Windows artefacts.

6. **Smoke-test the first build before publishing the draft release.**
   - Install the `.dmg` on Jana's Mac.
   - Verify launch (no Gatekeeper warning if signing + notarisation worked).
   - Walk through the V4.1.1 feature set.
   - Test auto-update end-to-end by publishing a `4.X.0` and then a
     `4.X.1` and watching the update happen on the test machine.

### Risk areas

- **Notarisation can take 5–30 minutes per build.** It's an Apple service
  and build times become unpredictable. Plan for it.
- **The first time signing + notarisation is set up is finicky.** Allow
  most of a day. Common gotchas: hardened runtime entitlements, missing
  certificate in CI keychain, app-specific password expiry.
- **macOS 15+ ("Sequoia") tightened Gatekeeper.** A signed-but-not-notarised
  app will refuse to launch by default. Make sure notarisation is in the
  pipeline before shipping.

### Done when

- Mac `.dmg` is downloadable from the public releases repo.
- Auto-update from V4.X.0 to V4.X.1 works on Mac.
- Mac users see native traffic lights, native menus, and `Cmd`-based shortcuts.
- README and the download page mention Mac availability.

---

## Phase 4 — Task reminders / notifications

**Goal:** TaskSpark actively nudges users about upcoming and overdue tasks.
Biggest ADHD-impact feature on the roadmap.

**Estimated effort:** 1 week for v1, plus a separate ~1 week later for true
web push (Phase 5).

### Scope of v1

- **Settings → Focus & Productivity → Reminders** section:
  - Toggle: "Remind me before a task is due"
  - Lead time picker: 15 min / 1 hr / 1 day
  - Toggle: "Morning roundup" (one notification each morning summarising
    today's tasks)
  - Toggle: "Tell me when a deferred task comes back"
- **Per-task bell** (optional): a small bell icon on the task modal that
  lets users set a custom reminder time, overriding the lead-time default.
- **Snooze options** in the notification: 10 min / 1 hr / tomorrow.

### Implementation shape

- All scheduling logic lives in `web/app.js`. Single source of truth.
- A scheduler function recomputes upcoming reminders on every `saveTasks()`.
  Two implementation options:
  - **Per-task `setTimeout`s** — accurate, but messy at scale.
  - **`setInterval` every 60 seconds** that scans tasks vs current time —
    simpler, off by up to 60 seconds. Pick this for v1.
- **Web (in-tab)**: use `Notification` API directly. Works whenever a tab
  is open. Permission asked **only when user opts into reminders**, not
  on first launch.
- **Desktop (Electron)**: web app calls `window.desktopAPI.notify(opts)`.
  Bridge fires Electron's `Notification` class, which renders a native
  Win/Mac OS-level notification. Works whether the app window is focused
  or not.
- **Click handling**: notification click → focus the app → open the task.

### Done when

- A user with reminders enabled sees a native notification N minutes
  before a task is due, on both Windows and Mac.
- Web users see the in-tab notification when the tab is open.
- Snooze options work and persist across app restarts.
- Notification permission is asked at the right moment (opt-in, not first launch).

---

## Phase 5 — Web push (later)

**Goal:** web companion users get notifications even when the tab is closed,
including on phones (when PWA is installed to home screen).

**Estimated effort:** ~1 week.

**Why this is separate:** it requires a backend (push server) and isn't
useful until Phase 4 is shipped. Don't bundle them.

### Stack

- **VAPID keys** for Web Push (free to generate; one keypair per project).
- **Cloudflare Worker** as the push server (~$0/month at our scale):
  - Endpoint to register subscriptions.
  - Endpoint to schedule "send at time X" notifications.
  - Storage in Cloudflare KV or D1 for subscriptions.
- **Service worker** in `web/sw.js` — already exists; gains a `push` event
  handler that shows the notification.

### iOS caveat

iOS Safari supports Web Push **only** when the PWA is installed to the
home screen, and only since iOS 16.4. UI should explain this honestly:
"Tap Share → Add to Home Screen to get reminders on iPhone."

---

## Decisions already made

| Decision | What we chose | Why |
|---|---|---|
| Architecture | Option C (web canonical, Electron wraps) | Mac is a forcing function; three copies would be unsustainable. |
| Apple Developer | Paid ($99/yr) | Required for Mac shipping at all; auto-update doesn't work without it. |
| Windows code-signing | Skip for now | Hobby budget; SmartScreen friction is survivable; revisit if drop-off becomes a real problem. |
| Mac native (Swift) | **Don't** | Solo dev cannot maintain a third codebase. |
| `core/` shared module | Skip | Going straight to Option C makes this redundant. |
| Stats accuracy bug-fix scope | Time-up-to-completion (B51) | Compares "actual cost of task" to "estimate of task cost" — semantically right. |
| Phase 2 storage migration | Bridge both config and cache to the main-process files | Original plan was cache-only behind an `offlineMode` check; bridging both means no re-sign-in or settings reset at flag-flip time. |

## Decisions still open

- **When to delete `src/app.js` / `src/index.html`** — after Phase 2 has
  been stable in production for ~2 weeks. Don't rush it.
- **When to flip `TASKSPARK_USE_WEB` to on-by-default** — after manual
  smoke-testing of the whole feature set on a fresh `userData` and on an
  existing V4.1.1 install.
- **Beta channel for Phase 2** — recommended but optional. Decide before
  flipping the flag default.
- **Mac code-signing CI runner** — GitHub Actions has macOS runners; that
  works fine for solo dev. If build minutes get tight, consider self-hosted.
- **Web push push-server hosting** — Cloudflare Worker is the default
  recommendation. Re-evaluate at Phase 5 time.

## Backlog items killed by these phases

These were pending but become irrelevant once Phase 2 lands. Don't pick
them up — they'll evaporate when `src/app.js` is deleted:

- **B48** — Migrate web's `fetch()` calls to `apiFetch`. Still worth doing
  on the web side, but not as a desktop-parity exercise.
- **B49** — Sync per-tag custom colours on the web companion. After
  Phase 2, web *is* desktop, so this becomes a no-op.

If they're still live in `backlog.md` when Phase 2 ships, delete them.

---

## How to use this file

If you're a future Claude session picking up TaskSpark:

1. Read `CLAUDE.md` first (working principles, conventions).
2. Read this file second.
3. Identify the active phase.
4. Confirm scope with Jana before writing code — she's non-technical and
   appreciates a one-line plan in plain English first.
5. Work on the designated branch (Jana's session prompt will tell you).
6. When the phase ships, update `CHANGELOG.md` and trim this file.
