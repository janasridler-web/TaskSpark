# TaskSpark V4

**Focus · Flow · Finish** — A task manager built for ADHD and AuDHD minds. Available as a Windows desktop app and a browser web companion at app.taskspark.tech (with a phone-essentials view at app.taskspark.tech/m).

## What's new in V4

- **Lists** — kanban-style boards with custom categories for anything that isn't a task: shopping, packing, reading, project boards.
- **Stats dashboard** — throughput, streaks, day-of-week patterns, productivity heatmap, time-by-tag, estimate accuracy. New users get a "Day X of 7" welcome that fills in over their first week.
- **Focus mode redesigned** — in-window full-viewport overlay instead of a separate window; works cleanly across multi-monitor setups.
- **Mobile essentials route** (web only) — visit /m on a phone for a Today-focused landing, 5-tab bottom nav, and a universal "+" picker for adding tasks, lists, ideas, habits, wins, or mood.
- **V4 onboarding** — preset chooser (Keep it simple / Full setup / I'll choose) replaces the old 10-step tutorial. Plus a "Get started" inline checklist for the first four milestones.
- **Settings reorganised** into seven thematic tabs: Task Organisation, Focus & Productivity, Wellbeing, Tools, Daily Flow, Appearance, Account & Data.
- Smaller V4 additions: per-tag custom colours, defer/hide-until, browser notifications for breaks, refresh-for-new-version banner, focus-running favicon dot.

See `CHANGELOG.md` for the full V4 entries (desktop and web companion). Web deploy notes live in `WEB-DEPLOY.md` and `WEB-WORKFLOW.md`. Every feature is catalogued in `features.md`.

## What was new in V3
- **Workspaces** — create separate workspaces (e.g. Work, Personal) each with their own Google Sheet, all under one Google account
- **Workspace switcher** — dropdown in the sidebar to switch between workspaces instantly
- **Per-workspace settings** — choose whether each workspace shares global settings or has its own
- **Active workspace indicator** — colour-coded workspace name shown in the toolbar
- All V2 features carried over

---

## Features

- **Tasks** — Create and manage tasks with priorities, due dates, tags, statuses, subtasks, time estimates, and recurring schedules
- **Kanban** — Drag-and-drop board view grouped by status or tag
- **Focus Timer** — Start a timer on any task; the app enters a distraction-free focus overlay while you work
- **Break Reminders** — Automatic prompts to step away at a custom interval, with a countdown break panel
- **What Now?** — Smart task picker that factors in priority, due date, energy, and mood
- **Habit Tracker** — Track daily habits with streaks and a 7 or 30-day grid
- **Wins Board** — Capture praise, achievements, and positive feedback
- **Ideas** — Capture and convert ideas into tasks
- **Lists** — Kanban-style custom boards for anything that isn't a task
- **Statistics** — Throughput, completion trends, and time tracking heatmap
- **Workspaces** — Separate workspaces (e.g. Work, Personal), each with its own Google Sheet
- **Offline mode** — Works without a Google account; syncs when reconnected (desktop only)
- **Auto-updater** — Silent background updates via GitHub Releases (desktop only)

---

## Keyboard Shortcuts

| Shortcut     | Action              |
|--------------|---------------------|
| `Ctrl+Space` | Quick add task      |
| `Ctrl+Z`     | Undo last action    |
| `N`          | New task            |
| `Escape`     | Close modal         |

---

## Development Setup

### Requirements
- Node.js LTS — https://nodejs.org
- A Google Cloud OAuth app (Client ID + Secret)
- Optionally: a Microsoft Azure OAuth app for Outlook Calendar

### First-time setup
1. Clone the repo
2. Run `npm install`
3. Copy `.env.example` to `.env` and fill in your credentials
4. Run `npm start` — this auto-generates `src/main.js` from the template and launches the app

### Running locally
```
npm start
```

### Building the installer
The build is run via GitHub Actions (manual trigger only) — see `.github/workflows/build.yml`.

To build locally:
```
node setup.js   # inject credentials into src/main.js
npm run build   # produces installer in dist/
```

### Publishing a release
Releases are published via GitHub Actions (manual trigger only) — see `.github/workflows/release.yml`.

1. Make sure `package.json` version is set to the new version number
2. Go to **Actions → Publish Release → Run workflow**
3. Enter the version number and click Run
4. The workflow builds the installer and stages a draft release on the public releases repo (`janasridler-web/taskspark-releases`)
5. Review the draft release, then publish it — users will be notified automatically on next launch

---

## Architecture Notes

See `CLAUDE.md` for detailed architecture notes (intended for AI-assisted development sessions).

---

## Changelog

See `CHANGELOG.md`.
