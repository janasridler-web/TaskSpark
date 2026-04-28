# TaskSpark

**Focus · Flow · Finish** — A Windows desktop task manager built for ADHD and AuDHD minds.

TaskSpark combines smart task prioritisation, a built-in focus timer, automatic break reminders, habit tracking, and streak tracking to help you stay focused, manage your energy, and actually finish what you start. Everything syncs to your Google Sheets so your data is always yours.

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
- **Offline mode** — Works without a Google account; syncs when reconnected
- **Auto-updater** — Silent background updates via GitHub Releases

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
