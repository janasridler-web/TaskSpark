# Web Companion — Workflow Guide

A plain-English walkthrough of how to make changes to the web companion
(`web/` folder). Companion to `WEB-DEPLOY.md`, which is more of a reference
sheet — this one is the narrative.

---

## The two sites

There are two web companion environments:

| Site                          | What it's for                                       | Who uses it       |
|-------------------------------|-----------------------------------------------------|-------------------|
| `staging.taskspark.tech`      | Test new changes before users see them              | Just you (Jana)   |
| `app.taskspark.tech`          | The real thing — what users get                     | Everyone          |

**Staging is your safety net.** Anything you (or Claude) change should land on
staging first, get clicked through on desktop and on your iPhone, and only
then get promoted to live.

---

## The branches

There are two branches that matter:

| Branch                                     | Auto-deploys to               |
|--------------------------------------------|-------------------------------|
| `claude/rebuild-web-companion-v4-3MuP2`    | `staging.taskspark.tech`      |
| `main`                                     | Nothing automatically         |

`main` is locked behind branch protection — changes only land via Pull
Request.

The V4 rebuild branch (`claude/rebuild-web-companion-v4-3MuP2`) is what
auto-pushes to staging. Every time a commit lands on that branch, GitHub runs
the staging workflow and the new version is live on `staging.taskspark.tech`
within ~2 minutes.

---

## How auto-deploy to staging works

1. You (or Claude) commit a change to `claude/rebuild-web-companion-v4-3MuP2`.
2. Git push to GitHub.
3. GitHub Actions notices the push and runs `.github/workflows/staging-web.yml`.
4. The workflow:
   - Replaces the OAuth placeholders in `oauth-config.js` with the real
     staging client ID/secret (from GitHub secrets).
   - FTPs the `web/` folder up to the staging server.
   - Skips `assets/` (icons, sounds), `.htaccess`, and a few cPanel-managed
     files because the FTP user can't overwrite them.
5. Within a minute or two, refresh `staging.taskspark.tech` to see it.

If the new version doesn't appear, your browser is probably showing a cached
copy. See "Forcing staging to refresh" below.

---

## How live (production) deploy works

Live is **manual on purpose** while V4 is in flight, so a stray commit can't
ship to users.

1. Open a Pull Request from `claude/rebuild-web-companion-v4-3MuP2` → `main`.
2. Merge the PR. **Nothing deploys yet.** The code is now on `main`, but
   `app.taskspark.tech` is still on whatever version it was before.
3. Go to GitHub → Actions tab → "Deploy Web" workflow → "Run workflow" button.
4. It runs the same steps as staging, but pushes to live. ~2 minutes later
   `app.taskspark.tech` is updated.
5. **Watch the Actions tab** for green. If it goes red, the live site is
   probably half-deployed and you should run it again.

When you're ready for live to auto-deploy on every `main` push (after V4 ships
and stabilises), see `WEB-DEPLOY.md` — it has the one-line YAML change.

---

## "I want to make a change to the web app" — the typical flow

1. **Tell Claude what to change**, in plain English, in this repo.
2. **Claude edits files in `web/` and commits to
   `claude/rebuild-web-companion-v4-3MuP2`.** No special steps.
3. **Claude pushes.** Auto-deploy to staging starts.
4. **You wait 1–2 minutes**, then refresh `staging.taskspark.tech` (and your
   iPhone) and click through the change.
5. **If it works:** decide whether to ship to live now or batch it with other
   changes. To ship now, follow "How live deploy works" above.
6. **If it doesn't work:** tell Claude what's wrong, repeat steps 1–4.

You generally never need to leave staging during this loop. Going to live is
a separate decision.

---

## Versioning (when does it matter?)

Two values control the cache: `WEB_VERSION` at the top of `web/app.js` and
`CACHE_NAME` at the top of `web/sw.js`. They **must always match** and they
**must change together**.

When to bump:

- **Shipping a real new release to live** (e.g. 4.0.0 → 4.1.0, or 4.0.0 →
  4.0.1 for a bug-fix release). Bump both. Users will see the
  "TaskSpark has updated — refresh" banner.
- **Shipping a small fix to staging** that you're going to bundle with bigger
  changes later. **Don't bump.** Just clear your own browser cache to test it
  (DevTools → Application → Service Workers → Unregister, then refresh).

Rule of thumb: the version number on staging should match the version number
that's currently live, until you're about to ship a new release. Don't
pre-emptively bump.

---

## Forcing staging to refresh

If you push a change but `staging.taskspark.tech` is still showing the old
version, your browser's service worker is serving a cached copy.

**On desktop Chrome:**
1. Open the page in a regular tab.
2. F12 → Application tab → Service Workers (left sidebar).
3. Click "Unregister" next to `staging.taskspark.tech`.
4. Hit Ctrl+Shift+R (hard refresh).

**On iPhone Safari:**
1. Settings → Safari → Advanced → Website Data → Edit → swipe-delete
   `staging.taskspark.tech`.
2. Or simpler: Safari → tap the AA / aA icon in the URL bar →
   "Clear website data".
3. Reopen the staging URL.

**If installed as a PWA on your iPhone home screen:**
- Long-press the icon → Remove App → Delete from Home Screen.
- Reopen Safari, navigate to staging, Add to Home Screen again.

---

## Things that are NOT auto-deployed

The staging and live workflows skip a few files for safety:

- **`web/assets/`** — icons, sounds. Historical file ownership on the assets
  folder means the FTP user can't overwrite them. Manually upload via cPanel
  File Manager when they change.
- **`.htaccess`** — server config. Edit via cPanel File Manager.
- **`oauth-config.js`** real values — the file in the repo has placeholders;
  the workflow injects the real values from GitHub secrets at deploy time.
  Never put real OAuth secrets in the repo.

---

## When something goes wrong

- **Staging deploy fails (red X in Actions tab)** — click into the run, read
  the error. Most common: FTP credential changed, or a file in `assets/` got
  ownership mismatch. Fix and re-push.
- **Staging shows old version forever** — see "Forcing staging to refresh".
- **Live shows old version after deploy** — same thing, but for users you
  can't force-clear. The refresh banner is what handles this — if a user
  sees the banner, they click it and they're updated. If you bumped
  `WEB_VERSION` and `CACHE_NAME`, the banner will fire on their next visit.
- **OAuth sign-in broken on staging** — make sure
  `https://staging.taskspark.tech/auth.html` is in the Google Cloud Console
  redirect URIs list, and same for the Outlook one.
- **Workflow stuck or weird** — manual cPanel zip-upload fallback is in
  `WEB-DEPLOY.md`.

---

## Quick reference

| What you want to do                                      | What happens                                          |
|----------------------------------------------------------|-------------------------------------------------------|
| Change something on the web app                          | Claude edits `web/`, commits, pushes — staging updates|
| See your change                                          | Wait ~2 min, refresh `staging.taskspark.tech`         |
| Ship to live                                             | Merge PR to `main`, then manually trigger workflow    |
| Bump the version number                                  | Only when actually releasing — both `WEB_VERSION` and `CACHE_NAME`, together |
| Update icons or sounds                                   | Upload by hand via cPanel File Manager                |
| Update `.htaccess`                                       | Edit by hand via cPanel File Manager                  |

For the technical detail behind any of this, see `WEB-DEPLOY.md`.
