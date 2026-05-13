# TaskSpark Backlog

Things we've decided to do later. Items go here when:
- An audit/review found something but it's too risky or too big for the current release.
- You say "we'll do that later", "park that", "not now", "add to backlog", or similar.

When tackling an item, move its checkbox to **In progress**, and on completion, **delete the line** (the commit history keeps the record). New items go under the right severity heading; if you're unsure of severity, drop it under **Unsorted** and we'll triage.

Last updated: 2026-05-13 (mobile sign-in fix shipped, picker cleanup deferred)

---

## Blocker (do before next release)

_Empty._

## Strongly Recommended (should do soon)

- [ ] **A1 — Add ARIA labels to every icon-only button.** Right now icon-only buttons (`✕`, `▶`, `■`, `↩`, `✎`, `+`, `←`) have only a `title` tooltip, which screen readers don't read reliably. Need `aria-label` on every icon button. Also wrap modals in `role="dialog" aria-modal="true"` with `aria-labelledby`. Touches dozens of spots — best done as its own focused PR with screen-reader testing.
- [ ] **A3 — Make task and subtask checkboxes keyboard-accessible.** Currently they're `<div onclick=...>` so keyboard users literally can't tick a task off. Convert to `<button role="checkbox" aria-checked="...">` (or a real `<input type="checkbox">`) and handle Space/Enter. Affects task cards, subtasks, kanban columns, calendar chips. Medium effort.
- [ ] **U16 — Dedicated toast region.** Toasts piggyback on the sync-status label, so a sync error during a toast is masked. Move to a top-center toast container with `role="status" aria-live="polite"` so screen readers announce them and they don't fight with sync state.
- [ ] **P4 — Route all task micro-mutations through `saveTasksDebounced`.** ~25 call sites still call `saveTasks()` directly (Kanban drop, every subtask add/delete, every inline-edit blur, status flip, etc.). Each one writes the entire task list to Sheets. Should be an easy mechanical change but needs careful audit.
- [ ] **P7 — Use `rerenderTaskCard(id)` for single-task mutations.** 30+ call sites do `saveTasks(); renderAll();` for changes that affect one card. The cached `_lastTasksHTML` only short-circuits when the HTML matches exactly, which is rare. Only call `renderAll` when filter membership could have changed (toggle complete, delete, add).

## Nice-to-Have (whenever)

### Performance
- [ ] **P5 — Stop writing entity collections (habits/ideas/wins/lists) into config.json.** Currently every save writes to both Sheets and config — duplicates data and slows main-process IO. (Already partially fixed in 77363dd by gating local config writes to offline mode, but the dedicated-cache-file alternative is cleaner.)
- [ ] **P6 — Build sidebar counts + tag set in a single tasks pass.** `renderAll()` currently iterates the tasks array ~12 times (`updateCounts` does 10+ filters, `updateTagSidebar` flatMaps, `updateStreak` builds a Set). Single pass + invalidate-on-mutate would be much faster for users with hundreds of tasks.
- [ ] **P8 — Don't rebuild the whole Kanban DOM on drag-drop.** After each drop the entire board (all groups × 5 columns × all cards) is re-stringified. Move the dropped card via DOM manipulation, only update column counts.
- [ ] **P9 — Lazy-load workspace data on first switch.** `prefetchAllWorkspaces` fires 4 Sheets API calls per workspace × N workspaces 2 seconds after launch. Only prefetch the most-recently-used 1–2.
- [ ] **P14 — Smarter render-cache invalidation.** `_lastTasksHTML = ''` is set on every `saveTasks()` even when the change wasn't to a visible card. Either invalidate only on render-affecting fields or replace the cache with proper DOM reconciliation.
- [ ] **P16 — Memoise stats aggregations.** `_statsCache` is declared but unused. Throughput, by-day, heatmap, time-by-tag are recomputed every render. Memoise per `range + tasks-version`.

### UX / accessibility
- [ ] **A6 — Increase tap targets to ≥ 44×44 px.** Action buttons bumped to 32×32 in 77363dd; WCAG 2.5.5 wants 44. Also title-bar window controls and `.subtask-delete`.
- [ ] **A7 — Audit color contrast.** `var(--text3)` on `var(--surface)` may fail WCAG AA. Run an axe / Lighthouse pass and bump `--text3` darker if needed.
- [ ] **A8 — Keyboard alternative for drag-drop.** Reordering subtasks or moving Kanban cards across columns currently requires a mouse. Add up/down move buttons or expose status via the existing `<select>`.
- [ ] **U22 — Guard `triggerCelebration` callback when card is detached.** If the user navigates away during the 450 ms celebration animation, the callback still fires on a removed DOM node. Mostly cosmetic.

### Bugs / cleanup
- [ ] **B43 — Standardise IDs to either string or number across all collections.** Currently habits/wins use `String(Date.now())`, tasks/ideas/lists use numeric. The inline `onclick` handlers quote some and not others. Pick one and migrate all serializers + handlers + saved Sheets columns.
- [ ] **B49 — Sync per-tag custom colours on the web companion.** Desktop now stores `tagColors` and `tagColorsEnabled` on the active workspace (synced via the TaskSpark-Config sheet), but `web/app.js` still reads/writes `settings.tagColors` and `settings.tagCustomColorsEnabled` (localStorage-only). Mirror the desktop change in `web/app.js`: `getTagColor`, `setTagColor`, `toggleTagColorSection`, `applySettings`, plus the migration fallback in `getTagColors`. Once shipped, web will pick up colours desktop set and vice-versa.
- [ ] **B48 — Migrate web's existing fetch() calls to use apiFetch.** V4 introduced an `apiFetch(url, options)` wrapper in `web/app.js` that adds the `Authorization: Bearer …` header automatically, retries once on 401 by calling `api.oauthRefresh`, and surfaces network/HTTP errors as toasts. ~30+ existing direct `fetch()` call sites (sheetsLoad/Save/Ensure, Drive find/create, oauth-token, contact form, changelog fetch, etc.) still call `fetch` directly. Migrate them to `apiFetch` for consistent error handling and to retire the scattered token-expiry/`ensureToken` calls.
- [ ] **B50 — Investigate replacing Google Picker with a Drive API search everywhere.** The mobile-signin fix bypasses the Picker in `welcomeRestoreExisting` by calling `driveFindConfigSheetWeb` first (the Picker's iframe is broken on iOS Safari — third-party cookies are blocked by ITP and Google shows "Can't access your Google Account"). The same pattern likely works for every Picker call site in `web/app.js` (currently the only other live caller is the desktop-wrapped `showConfigPicker` route, plus `apis.google.com/js/api.js` loaded for the in-page Picker). If a search-then-disambiguate flow can cover all cases, we can delete `openConfigPickerWeb` and the `apis.google.com` script load entirely. Audit needed: are there any flows that legitimately need the user to pick a file Drive doesn't expose to the OAuth client via `drive.file` scope?

### Dependencies / build
- [ ] **S20 — Code-sign the NSIS installer.** Currently unsigned, so Windows shows a SmartScreen warning and `electron-updater` can't verify the publisher. Requires obtaining a code-signing certificate (Sectigo / DigiCert / Azure / SignPath, ~$50–$300/year). Once you have the cert, set `win.certificateFile` + `certificatePassword` in `package.json` build config and `win.publisherName` to the cert CN.

## Unsorted

### External Submissions — v2 follow-ups
- [ ] **E1 — Clean short-URL redirect at app.taskspark.tech/submit/&lt;id&gt;.** v1 ships with raw Apps Script URLs. Build a `/submit/index.html` + `/submit/links.json` mapping system on the web companion so users can hand out a tidy URL. Needs a flow for adding/updating entries in `links.json` without manual cPanel re-uploads (likely a small PHP receiver or Cloudflare Worker).
- [ ] **E2 — Per-workspace shared password for external submissions.** Owner sets a password; submitter enters it once and it's stored in localStorage on their device. Optional second layer of friction for spam prevention.
- [ ] **E3 — Custom branding / welcome text on the public submission page.** Today the served page just says "Submit a task to &lt;workspace name&gt;". Let owners add a custom intro paragraph and an optional logo URL.
- [ ] **E4 — Email notification to owner on new submission.** The bound Apps Script can `MailApp.sendEmail` to the script owner. Add a workspace setting to opt in.
- [ ] **E5 — File attachments in external submissions.** Submitter attaches a file; the Apps Script writes it to a `TaskSpark Submissions` Drive folder under the owner's account and stores the file ID on the task.
- [ ] **E6 — Bulk triage actions in Inbox view.** Multi-select inbox tasks and assign status/tags/priority in one go.
- [ ] **E7 — Inbox-as-Kanban-column.** Optionally show an Inbox column on the kanban board for drag-to-triage. v1 keeps Inbox as a dedicated sidebar view only.
- [ ] **E8 — Submission setup UI for pure-web users.** The wizard ported in Phase 2 slice 10 (`openSubmissionsWizardFor` and friends in `web/app.js`) is gated on `window.desktopAPI`, so users at `app.taskspark.tech` still can't set up external submissions — only the wrapped desktop can. The three backing IPCs (`submissionsLoadTemplate`, `submissionsVerifyUrl`, `submissionsEnsureSchema`) need web-side equivalents: the templates can be served from a static path under `web/templates/submissions/`; URL verification needs a small CORS-safe proxy (Cloudflare Worker is the obvious fit) since browsers can't fetch the Apps Script `/exec` endpoint cross-origin from `app.taskspark.tech`. The schema migration already runs against the Google Sheets REST API, so that part is portable. Once those exist, drop the `if (window.desktopAPI)` gate in `renderManageWorkspacesList`.

---

## How to use this file

When we agree to defer something, I'll add it here under the right severity heading. When you want to tackle items, point me at this file ("let's clear some backlog" / "do A3 next") and I'll work through them. Items get **deleted** when finished — git history is the record.

If something is bigger than one item, break it into bullets. Keep entries short: ID + one-sentence description + why-deferred if non-obvious.
