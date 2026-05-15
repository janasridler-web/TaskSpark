# TaskSpark Changelog

## V4.2.0 — May 2026

The big one. Mac ships for the first time, and Windows moves to a single
shared renderer under the hood. Most of the user-visible changes are
quality-of-life fixes that have been sitting in the web companion and are
now reaching the desktop.

### New

- **TaskSpark for macOS** — signed and notarised `.dmg` for both Apple
  Silicon and Intel Macs. Native traffic lights, standard Mac menubar
  (Cmd+Q / Cmd+W work as you'd expect), `Cmd+Shift+Space` for the global
  Quick Add shortcut (Cmd+Space is Spotlight, so we sidestep it).
- **Auto-find your TaskSpark-Config on a new device** — signing in on a
  fresh install now silently finds your existing workspace config in
  Drive and restores it. No more "Get Started / Restore from existing"
  pop-up unless you genuinely have multiple config files or none.
- **Today range on Stats** — Stats now has a "Today" tab with live KPIs
  (completed today, time tracked, in-progress, still open), a 24-hour
  activity strip showing your sessions, and an hour-by-hour minutes
  chart. The date banner auto-refreshes every 30 seconds.
- **Celebration animation when you tick a task off** — brief card pop +
  orange sparkle. Toggleable in Settings → Appearance.
- **Overdue task alerts** — opt-in blocking modal listing tasks past
  their due date. Two modes: all overdue tasks, or only ones you've
  individually flagged via a checkbox on the task modal.
- **Editable external-submission setup on the desktop's new renderer** —
  the wizard for configuring per-workspace external submission links is
  now available on Mac and on the wrapped Windows path.

### Fixes

- **Tag colours sync across devices** — custom per-tag colours now live
  on your workspace (synced via the TaskSpark-Config sheet) instead of
  being device-local. Set a colour on one machine, it appears on the
  others.
- **Lists no longer go missing after sign-in** — `loadLists()` was
  silently skipped in the signed-in init paths, so returning users
  ended up with an empty Lists view until they navigated to it.
- **Lists sidebar count actually updates** — was sticking at 0 even
  when lists existed.
- **Lists refresh on workspace switch** — the workspace prefetch cache
  stored tasks / habits / ideas / wins but not lists, so switching
  workspaces left stale lists on screen.
- **Settings, theme, and "Get started" dismiss state persist across
  sign-out** — these used to silently reset after a fresh sign-in
  because the post-OAuth callback short-circuited the cfg-loading.
- **Today hero panel includes overdue tasks** — the panel used to
  filter `due === today` literally, so overdue items got buried in the
  Later section. They now sort first inside the Today section, with an
  "(N overdue)" suffix on the label when any are present.
- **Calendar events load on sign-in** — `loadCalEvents` was missing
  from the post-sign-in load alongside ideas / habits / wins / lists.
- **View-switching cleanup** — every show-X-view path used to hand-roll
  its own list of "remove .active from these N siblings" and the lists
  had drifted, so certain sequences (Stats → Wins in particular) left
  two views stacked on top of each other. One source of truth now.

### Under the hood

- **Single renderer.** Both Windows and Mac now run `web/app.js` inside
  Electron — the same renderer the web companion at `app.taskspark.tech`
  uses. The legacy `src/app.js` desktop renderer is no longer reached
  by default but stays in the repo for a stable period before deletion
  (next release).
- **Title bar colour follows the chosen accent.** Pick a different
  theme colour and the chrome retints to match. Dark-mode and live
  re-tinting both work.
- **userData is shared between V4.1.1 and V4.2.0** — installing the
  update on Windows keeps your existing tokens, settings, workspaces,
  offline tasks, and tag-colour customisation. No re-sign-in needed.

### Notes for existing Windows users

If anything misbehaves on the new architecture, you can fall back to
the V4.1.1 renderer by launching the app with `TASKSPARK_USE_WEB=0` set
in your environment. (This escape hatch goes away in the next release
when the legacy renderer is removed.)

## V4.1.1 — May 2026

A small trust-and-accuracy patch on top of V4.1.0.

### Reliability fixes

- **Moving a task between workspaces is now safe** *(both apps)* — if the network drops mid-move, the task no longer ends up in both workspaces. The app stamps both sides during the move and self-heals on the next workspace load.

### Stats accuracy

- **On-estimate rate** *(both apps)* — now compares your estimate against the time you logged up to when the task was completed, not your lifetime time on it. Tasks reopened and worked on after completion no longer skew the percentage.
- **Heatmap split across hours** *(both apps)* — a 90-minute session starting at 23:30 now correctly puts 30 minutes on the late-night hour and 60 minutes on the early-morning hour, instead of dumping all 90 under the start hour.
- **Time tracked at window edges** *(both apps)* — sessions that straddle the start or end of the date range now contribute their in-window portion, instead of the all-or-nothing behaviour.
- **Time by tag stops double-counting** *(both apps)* — a task with two tags now splits its time evenly across them, so the rows sum to the overall "Time tracked" total instead of overshooting.

### Notes for existing users

The Tasks sheet schema gained three columns (`transferId`, `transferState`, `transferTargetWs`) used only during a workspace move. Existing sheets read fine; the new columns appear after the first save.

## V4.1.0 — May 2026

A polish release with a fresher look and a wide sweep of correctness fixes — most of them quiet bugs that could have lost work without warning.

### Look & feel

- **Today hero panel** — when you have tasks due today, a dedicated panel pulls them to the top so you see them first.
- **Visual streak widget** — the daily streak now shows as a 7-day grid with a flame, instead of a number.
- **State-coloured task cards** — overdue tasks tint red, today's tasks tint amber; the list is easier to scan at a glance.
- **Lucide icon set** — replaces the old mix of Unicode glyphs and emoji throughout the app, for sharper, more consistent visuals.
- **Sidebar refresh** — new "Sparkle of Completion" logo, redesigned app icons that hold up at small sizes, tidier circle checkboxes, and tighter top spacing.
- **Title bar in your accent colour** — the desktop title bar picks up your chosen accent.
- **Lighter chrome** — the top sync bar and progress bar are gone; sync status is folded into the stats area. The redundant view title and workspace pill are hidden when they don't add information.
- **Warmer onboarding copy** — first-run and empty-state messages have been reworded with an ADHD-aware voice.

### Mobile (web companion)

- **Empty Today screen** now reads "Nothing due today" instead of a generic "All clear!" — clearer that the page loaded.
- **iPhone Dynamic Island** — content no longer slides up under the status bar / Dynamic Island on the PWA.

### Reliability fixes

- **Tag colours sync between computers** *(desktop)* — colours are now stored on your workspace, not on the local machine. Existing colours are migrated automatically.
- **CSV importer** — clearer "Anchor Date" guidance, blocks importing T-offset templates without an anchor date set, and shows the resolved due date next to each task in the preview.
- **Calendar events keep their tags and multi-day end dates** *(web)* — these were silently dropping every reload.
- **"Hide until N days before due"** *(both apps)* — no longer drifts a day off for users outside the UTC timezone.
- **Recurring tasks completed late** *(both apps)* — the next occurrence is now scheduled in the future, not already overdue.
- **"n" keyboard shortcut** *(desktop)* — no longer stacks a new-task modal on top of an already-open modal.
- **Workspace switch races** *(web + desktop)* — tasks edited just before a workspace switch can no longer be saved into the wrong workspace's spreadsheet.
- **Failed workspace load** *(web)* — if a workspace fails to load (e.g. flaky network), the app rolls back to the previous workspace instead of leaving you on an empty screen where the next edit could wipe Drive data.
- **Token-refresh failures are no longer silent** *(both apps)* — if Google's token refresh fails, the sync indicator surfaces the error instead of pretending everything is fine while edits silently fall on the floor.

---

## Web Companion V4.0.0 — April 2026

The web companion at app.taskspark.tech catches up to desktop V4.0.0 and adds a phone-first essentials experience.

### Feature parity with desktop V4

- **Lists** — kanban-style boards with custom categories, drag-and-drop cards on desktop, vertical category stacking on phone.
- **Stats dashboard** — throughput, streak, day-of-week, heatmap, time-by-tag, estimate accuracy, with profile-aware tiers (Basic / Timer / Full). New users see a "Day X of 7" welcome card that fills in over their first week.
- **Focus mode overlay** — distraction-free in-window full-viewport timer view (Settings → Focus & Productivity).
- **Defer / hide-until** — push tasks to reappear N days before their due date.
- **Per-tag custom colours** — pick a colour for each tag in Settings → Appearance.
- **V4 onboarding** — first-run preset modal (Keep it simple / Full setup / I'll choose) replaces the legacy 10-step tutorial. New users get a "Get started" inline checklist.
- **V4 settings reorg** — seven thematic tabs matching desktop (Task Organisation / Focus & Productivity / Wellbeing / Tools / Daily Flow / Appearance / Account & Data).

### Web-specific

- **Mobile essentials route** — visit /m (or get auto-redirected on a phone) for a Today-focused landing with a 5-tab bottom nav (Tasks / Habits / + / Lists / More) and a universal "+" picker for adding tasks, lists, ideas, habits, wins, or mood. "Use full version" toggle lives in Settings.
- **Browser notifications** for break reminders so you see the alert even when TaskSpark is in another tab.
- **Refresh-for-new-version banner** — no more being stuck on an old cached build after a deploy.
- **Favicon dot** when a timer is running, visible in the browser tab strip.
- **In-page timer panel** when focus mode is off — small bottom-right indicator that stays put across views.

### Quality

- Service worker upgraded for reliable cache busting (network-first for HTML/JS, versioned cache name).
- Centralised fetch wrapper with auto-retry on token expiry.
- Accessibility quick wins — proper toast region with `aria-live`, ARIA labels on icon-only close buttons, real `<button role="checkbox">` task and subtask checkboxes (keyboard-navigable, screen-reader friendly).

---

## Desktop V4.0.0 — 26 April 2026

### New Features

- **Lists** — A new Lists tool lets you create kanban-style boards with custom categories, drag-and-drop cards, inline editing, and automatic sync to Google Sheets.
- **Statistics** — A new Stats page shows task throughput, completion trends, a time-tracking heatmap, and key metrics across 7-day, 30-day, and 90-day windows.
- **Focus Mode (redesigned)** — Focus mode now takes over the TaskSpark window directly rather than opening a separate window. It always fits your screen perfectly and works correctly across multi-monitor setups.
- **Multi-monitor support** — The floating timer and break prompt now open on whichever screen TaskSpark is on, not always the primary monitor.

### Improvements

- Updated to Electron 34 for improved security and compatibility with current versions of Windows.
- General improvements to stability, performance, security, and accessibility.

---

## V3.5.1 — January 2026

- First-run welcome modal for new users.
- Onboarding flow fixes.
- Web companion stability improvements.

---

## V3.5.0 — December 2025

- Web companion app (taskspark.tech) — read-only view of your tasks from any browser.
- Outlook Calendar integration.
- Automatic web deployment pipeline.

---

## V3.4.0 — November 2025

- Kanban view.
- Budget tracking.
- Tag colour picker.
- Defer tasks.
- Overdue task alerts.
