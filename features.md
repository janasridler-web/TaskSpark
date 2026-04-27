# TaskSpark Features

Every feature in TaskSpark, grouped to match the seven settings tabs plus a few
extras (onboarding, sign-in, web-only). Each entry is tagged:

- **Platform** — Desktop · Companion · Both
- **Version** — V3.5 (anything that existed before V4) · V4.0.0

Settings (toggles, dropdowns, sliders) are not listed here — only the features
those settings turn on or shape.

> When a feature is added or removed, update this file in the same change.
> See `CLAUDE.md` for the rule.

---

## Task Organisation

### Tasks
**Both · V3.5** — The core unit. Title, description, priority, due date, tags,
status, energy, time estimate.

### Subtasks
**Both · V3.5** — Checklist items inside a task. Drag to reorder, inline edit.

### Tags
**Both · V3.5** — Coloured badges on tasks. Filterable from the sidebar.

### Priorities
**Both · V3.5** — Low / Medium / High. Used by sort and by What Now?.

### Task status
**Both · V3.5** — Not Started · In Progress · Blocked · On Hold. Auto-flips to
In Progress when a timer starts.

### Energy level on tasks
**Both · V3.5** — Tag a task with the energy it needs. Factors into What Now?.

### Time estimates
**Both · V3.5** — Optional minutes estimate. Compared against actual time spent.

### Due dates
**Both · V3.5** — Calendar picker. Drives Overdue / Due Today / Soon badges.

### Recurring tasks
**Both · V3.5** — Daily / weekly / monthly / custom interval / specific days.

### Defer (hide-until)
**Both · V4.0.0** — Push a task out of view until N days before its due date.
A separate "Deferred" sidebar view lets you see them.

### Archive
**Both · V3.5** — Move completed tasks to a separate Archived view (and a
separate Sheets tab). Bulk restore is supported.

### Sort
**Both · V3.5** — By created, due date, priority, A–Z, or status.

### Filter by tag
**Both · V3.5** — Click a tag in the sidebar to narrow the list.

### Kanban board view
**Both · V3.5** — Drag tasks between status columns. Optionally group by tag.

### Lists
**Both · V4.0.0** — Kanban-style boards with custom categories, drag-and-drop
cards on desktop, vertical category stacking on phone. Use for shopping,
packing, reading, project boards — anything that isn't a task.

### Quick Add
**Desktop · V3.5** — Global Ctrl+Space shortcut to add a task even when
TaskSpark is minimised.

### Undo / Redo
**Desktop · V3.5** — Ctrl+Z, up to 20 steps.

---

## Focus & Productivity

### Task timer
**Both · V3.5** — Start a Pomodoro-style timer on any task. Pause and resume.
Per-task session history is kept.

### Always-on-top floating timer
**Desktop · V3.5** — Small timer window pinned to the bottom-right of the
screen. The main window minimises while it runs.

### Focus mode
**Both · V4.0.0** — Distraction-free full-viewport timer. On desktop it covers
the TaskSpark window (multi-monitor friendly). On companion it's an in-window
overlay.

### In-page timer panel
**Companion · V4.0.0** — When focus mode is off, a compact timer indicator
sits at the bottom-right of the page so you always know a task is running.

### Favicon timer dot
**Companion · V4.0.0** — A green dot appears on the browser tab favicon
whenever a timer is running.

### Time estimate vs actual badge
**Both · V3.5** — Compares your estimate against the time you actually spent.

### Break reminders
**Both · V3.5** — Prompt to take a break after a configurable interval. Snooze
is supported.

### Always-on-top break prompt
**Desktop · V3.5** — Break reminder opens as a separate always-on-top window.

### Custom break sound
**Desktop · V3.5** — Pick your own audio file to play on a break prompt.

### Browser notifications on break
**Companion · V4.0.0** — Native browser notification when a break is due, even
if TaskSpark is in another tab.

### What Now?
**Both · V3.5** — Smart task picker that weighs priority, due date, mood and
energy.

---

## Wellbeing

### Mood check-in
**Both · V3.5** — Pick from 😔 / 😐 / 😊. Logged to Sheets and used by
What Now?.

### Streak tracker
**Both · V3.5** — Daily streak with best-streak record. Sidebar widget.
Weekend toggle.

### Vacation mode
**Both · V3.5** — Pause your streak while you're away.

### Grace day
**Both · V3.5** — Protect a streak after one missed day.

---

## Tools

### Ideas board
**Both · V3.5** — Card grid for capturing ideas. One-click "→ Make task"
converts an idea into a task.

### Habit Tracker
**Both · V3.5** — Daily habits with emoji icons, active days, 7- or 30-day
grid, current and best streak per habit.

### Wins Board
**Both · V3.5** — Capture praise, feedback, achievements as win cards. Five
mood tags. After completing a task you can send it straight to Wins.

### Random Win
**Both · V3.5** — A 🎲 button surfaces a random past win as a full-screen
pick-me-up.

### Stats dashboard
**Both · V4.0.0** — Throughput, streak, day-of-week patterns, productivity
heatmap, time-by-tag, estimate accuracy. Profile-aware tiers (Basic / Timer /
Full) hide charts that need data you don't collect. New users see a
"Day X of 7" welcome card that fills in over their first week.

### Budget tracking
**Desktop · V3.5** — Track spending alongside tasks.

### Calendar integrations
**Desktop · V3.5** — Google Calendar and Outlook Calendar sync.

### Export to CSV
**Desktop · V3.5** — Export all tasks or completed tasks only.

---

## Daily Flow

### Completion dialog
**Both · V3.5** — On task completion, optionally log impact, outcome and
deliverable.

### Send to Wins on completion
**Both · V3.5** — Tick a box on the completion dialog to push the task into
the Wins Board.

### Auto-set In Progress on timer start
**Both · V3.5** — Starting a timer flips status to In Progress automatically.

---

## Appearance

### Dark mode
**Both · V3.5** — Manual toggle plus Settings preference.

### Colour themes
**Both · V3.5** — Seven accent themes: Forest, Ocean, Lavender, Sunset, Rose,
Slate, Moss. Click a swatch to apply instantly.

### Per-tag custom colours
**Both · V4.0.0** — Pick a colour for each individual tag in
Settings → Appearance.

### Window size and position memory
**Desktop · V3.5** — TaskSpark reopens at the size and position you left it.

---

## Account & Data

### Google sign-in
**Both · V3.5** — OAuth with Google. Companion uses redirect flow; desktop
uses the system browser.

### Google Sheets sync
**Both · V3.5** — All data lives in your own Google Sheet. No third-party
database.

### Workspaces
**Both · V3.5** — Multiple workspaces (e.g. Work, Personal) under one Google
account, each with its own Sheet.

### Workspace switcher
**Both · V3.5** — Sidebar dropdown to flip between workspaces instantly.
Active workspace name is colour-coded in the toolbar.

### Per-workspace settings
**Both · V3.5** — Each workspace can share global settings or have its own.

### Offline mode
**Desktop · V3.5** — Use TaskSpark without a Google account. Local storage
only.

### Auto-updater
**Desktop · V3.5** — Notifies and updates automatically from the public
releases repo on next launch.

### Refresh-for-new-version banner
**Companion · V4.0.0** — When a new build is deployed, a banner offers a
one-click refresh so you're never stuck on a stale cached version.

### PWA install (Add to Home Screen)
**Companion · V3.5** — The companion is a PWA: installable from the browser
menu, runs in its own window/icon, works offline once cached.

---

## Onboarding & first run

### V4 preset chooser
**Both · V4.0.0** — First-run modal: **Keep it simple** (recommended), **Full
setup**, or **I'll choose**. Replaces the legacy 10-step tutorial.

### "Get started" inline checklist
**Both · V4.0.0** — Compact card on the home screen guiding the first four
milestones (add a task, start a timer, etc.). Hides itself when complete.

### "Day X of 7" stats welcome
**Both · V4.0.0** — New users see a welcome card on Stats that fills in over
their first week.

### What's New modal
**Both · V3.5** — Shown on first launch after an update.

---

## Companion-only (web)

### Mobile essentials route (/m)
**Companion · V4.0.0** — Phone-first landing at `app.taskspark.tech/m`. Phones
hitting the desktop URL are auto-redirected. A "Use full version" link in
Settings overrides the redirect.

### 5-tab bottom navigation
**Companion · V4.0.0** — Tasks · Habits · + · Lists · More. The + is a
universal add picker.

### Universal "+" picker
**Companion · V4.0.0** — One button to add a task, list, idea, habit, win, or
mood. Picker hides options for tools you have switched off.

### Today / Upcoming / All toggle
**Companion · V4.0.0** — Three-button toggle on the mobile Tasks tab.

### "More" popup
**Companion · V4.0.0** — Compact popup above the More button with the views
that don't fit on the bottom bar (Ideas, Wins, Mood, What's New, Settings,
Use full version, Sign out).

---

## Desktop-only

### Frameless window with custom title bar
**Desktop · V3.5** — Custom minimise/maximise/close controls.

### Multi-monitor support
**Desktop · V4.0.0** — The floating timer and break prompt open on whichever
screen TaskSpark is on, not always the primary monitor.

### Global keyboard shortcuts
**Desktop · V3.5** — Ctrl+Space (Quick Add), Ctrl+Z (Undo), N (New task), Esc
(Close modal).
