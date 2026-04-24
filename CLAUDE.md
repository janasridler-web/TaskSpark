# TaskSpark — Claude Code Notes

## Project overview
Electron desktop app (Windows) built with vanilla JS, no framework. Monolithic renderer: `src/app.js` + `src/index.html`. Google Sheets sync via Drive API.

## Key files
- `src/app.js` — all renderer logic (~6900 lines)
- `src/index.html` — all HTML + CSS inline
- `src/main.template.js` — Electron main process template (no credentials)
- `src/main.js` — actual main process used at runtime (never commit — contains OAuth credentials)
- `src/preload.js` — contextBridge IPC bindings

## main.js workflow
`src/main.js` is a copy of `src/main.template.js` with OAuth credentials added manually:
```js
const APP_CLIENT_ID     = 'YOUR_CLIENT_ID_HERE';
const APP_CLIENT_SECRET = 'YOUR_CLIENT_SECRET_HERE';
```
After editing `main.template.js`, the user must re-copy and re-add credentials. `main.js` is gitignored.

## Development branch
Active branch: `claude/design-file-integration-JjZu1`

## Architecture notes
- **IPC pattern**: `ipcMain.handle(channel, handler)` in `main.template.js`, exposed via `preload.js` contextBridge, called as `api.methodName()` in `app.js`
- **Settings**: `settings` object in `app.js`, persisted via `api.saveConfig({ settings })`, applied with `applySettings()`
- **No build step for renderer**: edit `src/app.js` and `src/index.html` directly, restart Electron to see changes
- **Views**: controlled by `setView(viewName, el)` — updates `currentView` global and shows/hides containers
- **Modals**: `.modal-overlay` elements toggled via `.open` CSS class. `closeModalOutside(event, id)` handles backdrop clicks

## Custom UI patterns
- **Date picker**: `date-picker-btn` + `calendar-popup` — used consistently across modals (task due date, wins date, etc.). Do NOT use `<input type="date">`.
- **Settings tabs**: `switchSettingsTab(tabName, el)` — tab IDs are `settings-tab-{name}`, e.g. `settings-tab-task-org`
- **Sidebar sections**: collapsible via `toggleSection(name)` + `collapsible-content` divs

## Settings tab structure (as of v3)
Left nav → panel mapping:
- `task-org` → Task Organisation (fields: tags, status, due, energy, subtasks, recurring, attachments, completion dialog)
- `focus` → Focus & Productivity (What Now, Quick Add, timer, estimates, break reminders + sub-settings)
- `wellbeing` → Wellbeing (mood, streak + sub-settings)
- `tools` → Tools (Stats, Ideas, Habits, Wins, Kanban + sub-settings, Budget + sub-settings, Calendar)
- `daily-flow` → Daily Flow (SOD + EOD sub-settings)
- `appearance` → Appearance (dark mode, accent colour, changelog in sidebar)
- `account` → Account & Data (account, integrations, workspaces, data, onboarding replay)
- `changelog` → What's New (secondary nav link)
- `contact` → Contact Us (secondary nav link)

## Sidebar structure (as of v3)
- **TASKS**: All Tasks, Due Today, Overdue, Completed, Archived
- **Filters**: Priority (collapsible), Status (collapsible), Tags (collapsible)
- **TOOLS**: Stats, Ideas, Habit Tracker, Wins Board, Budget View, Calendar, Kanban

## Recent work (this session)
- PDF export to Google Drive via `printToPDF` (IPC: `drive-upload-pdf`)
- Wins board custom date picker
- Interactive onboarding checklist (replaces dark overlay tutorial)
- Sidebar reorganisation (VIEWS → TASKS, Calendar/Kanban → TOOLS)
- Settings restructured from General+Feature Settings into 7 focused tabs
