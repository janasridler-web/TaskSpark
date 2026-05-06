# TaskSpark Backlog

Things we've decided to do later. Items go here when:
- An audit/review found something but it's too risky or too big for the current release.
- You say "we'll do that later", "park that", "not now", "add to backlog", or similar.

When tackling an item, move its checkbox to **In progress**, and on completion, **delete the line** (the commit history keeps the record). New items go under the right severity heading; if you're unsure of severity, drop it under **Unsorted** and we'll triage.

Last updated: 2026-04-26 (V4.0.0 release prep)

---

## Blocker (do before next release)

_Empty._

## Strongly Recommended (should do soon)

- [ ] **A1 — Add ARIA labels to every icon-only button.** Right now icon-only buttons (`✕`, `▶`, `■`, `↩`, `✎`, `+`, `←`) have only a `title` tooltip, which screen readers don't read reliably. Need `aria-label` on every icon button. Also wrap modals in `role="dialog" aria-modal="true"` with `aria-labelledby`. Touches dozens of spots — best done as its own focused PR with screen-reader testing.
- [ ] **A3 — Make task and subtask checkboxes keyboard-accessible.** Currently they're `<div onclick=...>` so keyboard users literally can't tick a task off. Convert to `<button role="checkbox" aria-checked="...">` (or a real `<input type="checkbox">`) and handle Space/Enter. Affects task cards, subtasks, kanban columns, calendar chips. Medium effort.
- [ ] **A4 — Trap focus inside open modals.** Tab key currently escapes out to background buttons when a modal is open. Need a generic focus trap on `.modal-overlay.open`.
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
- [ ] **B45 — Desktop "Add your first task" auto-ticks on demo tasks.** `src/app.js` line 733 calls `checkOnboardingItem('addTask')` whenever `tasks.length > 0`, which fires on the auto-seeded sample tasks (`Review quarterly report`, `Buy groceries`, `Schedule dentist`). Brand-new users see the milestone pre-ticked even though they haven't actually added a task. Fix: remove the auto-tick and let `saveTask` be the only place that ticks the checkbox (matches the web V4 fix in commit fc5...). Also affects the welcome flow — they get less of a "do this first" nudge.
- [ ] **B46 — Remove sample-task seeding on both companion and desktop.** `sampleTasks()` in `web/app.js` (line ~1199) and `src/app.js` (line ~798) auto-seeds three demo tasks (`Review quarterly report`, `Buy groceries`, `Schedule dentist`) for new users. With the V4 "Get started" inline checklist now guiding new users, the demo tasks are redundant noise — they clutter the task list before the user has done anything. Delete the seed and let new users land on a clean empty state with the Get Started card prompting them to add their first real task.
- [ ] **B47 — Hide dependent settings rows when their parent feature is off (desktop).** Web V4 gates several "child" settings on their parent feature: Hide-until (Defer) on `dueEnabled`, Tag Colours on `tagsEnabled`, Break sub-settings on `breakEnabled`, Kanban sub-settings (group-by-tag, keep-completed) on `kanbanEnabled`, Budget sub-settings (currency, group-by-tags) on `budgetEnabled`. Desktop's settings still show all child toggles regardless of the parent. Apply the same gating in `src/app.js` `applySettings()` and the equivalent DOM IDs.
- [ ] **B50 — Make moveTaskToWorkspace transactional.** `src/app.js` `moveTaskToWorkspace` writes the task to the target workspace's sheet, then deletes from the source. If the second write fails (network blip, token expiry, app close mid-flight), the task ends up in BOTH workspaces — no rollback, no idempotency key. Needs a stable transfer ID on the moved task plus a dedupe-on-load step, OR a transactional sequence that rolls the source back to its pre-move state and surfaces a clear error to the user. Touches a recently-shipped V4 feature, so worth proper design before changing.
- [ ] **B49 — Sync per-tag custom colours on the web companion.** Desktop now stores `tagColors` and `tagColorsEnabled` on the active workspace (synced via the TaskSpark-Config sheet), but `web/app.js` still reads/writes `settings.tagColors` and `settings.tagCustomColorsEnabled` (localStorage-only). Mirror the desktop change in `web/app.js`: `getTagColor`, `setTagColor`, `toggleTagColorSection`, `applySettings`, plus the migration fallback in `getTagColors`. Once shipped, web will pick up colours desktop set and vice-versa.
- [ ] **B48 — Migrate web's existing fetch() calls to use apiFetch.** V4 introduced an `apiFetch(url, options)` wrapper in `web/app.js` that adds the `Authorization: Bearer …` header automatically, retries once on 401 by calling `api.oauthRefresh`, and surfaces network/HTTP errors as toasts. ~30+ existing direct `fetch()` call sites (sheetsLoad/Save/Ensure, Drive find/create, oauth-token, contact form, changelog fetch, etc.) still call `fetch` directly. Migrate them to `apiFetch` for consistent error handling and to retire the scattered token-expiry/`ensureToken` calls.

### Dependencies / build
- [ ] **S20 — Code-sign the NSIS installer.** Currently unsigned, so Windows shows a SmartScreen warning and `electron-updater` can't verify the publisher. Requires obtaining a code-signing certificate (Sectigo / DigiCert / Azure / SignPath, ~$50–$300/year). Once you have the cert, set `win.certificateFile` + `certificatePassword` in `package.json` build config and `win.publisherName` to the cert CN.

## Unsorted

_Empty._

---

## How to use this file

When we agree to defer something, I'll add it here under the right severity heading. When you want to tackle items, point me at this file ("let's clear some backlog" / "do A3 next") and I'll work through them. Items get **deleted** when finished — git history is the record.

If something is bigger than one item, break it into bullets. Keep entries short: ID + one-sentence description + why-deferred if non-obvious.
