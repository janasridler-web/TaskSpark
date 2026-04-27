# TaskSpark Changelog

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
