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

## Project context

TaskSpark is a Windows Electron desktop task manager for ADHD/AuDHD users,
shipping V4.0.0. Architecture:
- `src/main.template.js` — Electron main process. Committed with credential
  placeholders (`__APP_CLIENT_ID__` etc.).
- `src/main.js` — gitignored. Generated from the template by `setup.js`,
  which reads real credentials from `.env`. Runs automatically before
  `npm start`.
- `src/app.js` — renderer (UI logic, ~7500 lines).
- `src/preload.js` — IPC bridge between main and renderer.
- Cloud storage = Google Sheets (per workspace, multiple workspaces supported).
- Releases publish to a separate public repo `janasridler-web/taskspark-releases`
  via `electron-updater`.

Two-repo strategy: source code stays in this repo (planned to go private);
installer binaries published to the public releases repo so auto-update works.
