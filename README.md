# TaskSpark V3

**Focus · Flow · Finish** — A desktop task manager built for ADHD and AuDHD minds.

## What's new in V3
- **Workspaces** — create up to 3 separate workspaces (e.g. Work, Personal) each with their own Google Sheet, all under one Google account
- **Workspace switcher** — dropdown in the sidebar to switch between workspaces instantly
- **Per-workspace settings** — choose whether each workspace shares global settings or has its own
- **Active workspace indicator** — colour-coded workspace name shown in the toolbar
- All V2 features carried over

---

## Changelog

### v2.8.0
**Wins Board**
- New Wins Board view accessible from the TOOLS section in the sidebar
- Capture praise, feedback and personal achievements as win cards
- Each win has a quote, optional source, category, date and mood tag
- Five mood options: 💪 Proud, 🙏 Grateful, 🎉 Excited, 😌 Relieved, ✨ Inspired
- Card grid layout — most recent wins shown first
- 🎲 Random Win button surfaces a random win as a full-screen pick-me-up
- After completing a task, optionally send it straight to the Wins Board
- Synced to a dedicated Wins tab in Google Sheets
- Toggleable in Settings → General → Tools

**Colour Themes**
- Seven accent colour themes: Forest (default), Ocean, Lavender, Sunset, Rose, Slate, Moss
- Colour picker in Settings → Appearance — click a swatch to apply instantly
- All themes work correctly in both light and dark mode
- Choice is saved and restored between sessions

**Task Breakdown Helper**
- ⚡ Break it down button on every task modal
- Uses AI to suggest 4–6 concrete, actionable subtasks based on the task title and description
- Review suggestions as a checklist — tick, edit or remove any before applying
- Regenerate if the first suggestions aren't quite right
- Applied subtasks are added directly to the task's subtask list
- Works for both new and existing tasks

### v2.7.0
**Ideas**
- New Ideas view accessible from the TOOLS section in the sidebar
- Card grid layout with title, description and coloured tags
- Add, edit and delete ideas via a modal
- One-click "→ Make task" button converts an idea to a task
- Tags use the same coloured badge style as task cards
- Synced to a dedicated Ideas tab in Google Sheets
- Toggleable in Settings → General → Tools

**Habit Tracker**
- New Habits view accessible from the TOOLS section in the sidebar
- Add habits with a name, emoji icon and active days
- 40-emoji picker with a custom text input for any emoji
- All days selected by default when creating a new habit
- 7 or 30 day grid toggleable at the top
- Grid cells show: done (green ✓), missed (red ✕), today (accent outline), N/A (grey)
- Click any cell to toggle completion
- Current streak + best streak shown per habit
- Synced to a dedicated Habits tab in Google Sheets
- Toggleable in Settings → General → Tools

**Sidebar reorganisation**
- Ideas and Habit Tracker moved into a new TOOLS section
- TOOLS section hides entirely when both are disabled in Settings

**Bug fixes & performance**
- Removed duplicate `setView` function — old stale copy cleaned up
- Added `habitsMode` flag so `renderAll` correctly re-renders habits after data changes
- Fixed `setView` not clearing `habitsMode` when switching away from Habits
- Fixed `showToast` overwriting sync error/offline status — now restores the previous label
- Fixed `convertIdeaToTask` missing the `recurrence` field, which caused Sheets save errors
- Fixed `sheetsEnsure` not being callable from the main process — extracted into a reusable function
- Fixed Ideas and Habits not saving to Google Sheets — switched from PUT to clear + append
- Added proper Google Sheets API error logging
- Fixed input fields becoming unresponsive — added `contentEditable` cleanup on modal close and click
- HTML caching in `renderTasks` — skips DOM update when nothing changed
- Debounced Google Sheets saves for habits and subtasks
- `requestAnimationFrame` used to collapse rapid `renderAll` calls

### v2.6.0
- Kanban board view with drag-and-drop between status columns
- Group Kanban by tag (toggleable in Settings → Feature Settings → Kanban)
- Subtasks with drag-to-reorder and inline editing
- Recurring tasks (daily, weekly, monthly, custom interval, specific days)
- Archive completed tasks to a separate Google Sheets tab
- Bulk restore from the Archived view
- Vacation mode — pause your streak while you're away
- Grace day — protect a streak after one missed day
- Export task list to CSV (all tasks or completed only)
- Undo/redo stack (Ctrl+Z, up to 20 steps)
- In-progress status auto-set when a timer starts
- Offline mode — use TaskSpark without a Google account

### v2.5.0
- Break reminders — separate always-on-top prompt window
- Custom break duration and interval
- Custom break sound (pick your own audio file)
- Mood check-in — 😔 / 😐 / 😊 with mood logged to Google Sheets
- Energy level on tasks — factors into What Now? recommendations
- Task status (Not Started / In Progress / Blocked / On Hold)
- What's New modal on first launch after an update
- App version shown in sidebar

### v2.4.0
- Always-on-top timer window (minimises main window while timing)
- Pause and resume timer
- Break reminders with snooze option
- Per-task time logging and session history
- Time estimate vs actual comparison badge

### v2.3.0
- What Now? smart task picker — factors in priority, due date and mood
- Completion dialog — log impact, outcome and deliverable on task completion
- Quick Add (Ctrl+Space) — global shortcut works even when app is minimised
- Streak tracker with best streak, weekend toggle and sidebar widget

### v2.2.0
- Tag system with colour-coded badges
- Filter by tag in sidebar
- Collapsible sidebar sections (Priority, Status, Tags)
- Sort tasks by created, due date, priority, A–Z, or status

### v2.1.0
- Due date calendar picker
- Overdue / Due Today / Soon badges
- Status filter sidebar items
- Dark mode (manual toggle + Settings)
- Window size and position saved between sessions

### v2.0.0
- Complete rewrite — Electron app for Windows
- Google Sheets sync (no manual spreadsheet setup)
- Custom frameless window with title bar controls
- Auto-updater via GitHub Releases

---

## V3 Backlog

Ideas under consideration for future releases — not committed to any timeline:

- **Multiple task lists** — switch between named lists (work, personal, projects, etc.)
- **Daily digest** — morning summary of what's due today, streaks, and suggested focus
- **Mac version** — native macOS build and installer
- **Task age warning** — highlight tasks that have been sitting untouched for too long
- **AI performance review** — weekly summary of completed work, patterns and suggestions
- **Code signing** — signed Windows installer to avoid SmartScreen warnings
- **Linux version** — AppImage or .deb build for Linux users

---

## Setup (Development)

### Requirements
- Node.js LTS — https://nodejs.org
- A verified Google OAuth app (see below)

### Install & Run
```
npm install
npm start
```

### Before you can build
You need to add your OAuth credentials to `src/main.js`:
```js
const APP_CLIENT_ID     = 'YOUR_CLIENT_ID_HERE';
const APP_CLIENT_SECRET = 'YOUR_CLIENT_SECRET_HERE';
```

These come from your Google Cloud Console OAuth consent screen.
Once your OAuth app is verified by Google, any user can sign in without being added as a test user.

### Build installer
```
npm run build
```

### Publishing an update
1. Update version in `package.json`
2. Run `npm run build`
3. Create a new release on GitHub at https://github.com/janasridler-web/taskspark
4. Upload the `dist/TaskSpark Setup x.x.x.exe` and `dist/latest.yml` files
5. Users will be notified automatically on next launch

---

## Keyboard shortcuts
| Shortcut   | Action           |
|------------|------------------|
| Ctrl+Space | Quick add task   |
| Ctrl+Z     | Undo last action |
| N          | New task         |
| Escape     | Close modal      |
