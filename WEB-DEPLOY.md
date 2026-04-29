# Web Companion — Deploy Notes

Quick reference for shipping the web companion. Two environments:

- **Staging**: `staging.taskspark.tech` — auto-deploys on every push to the V4 rebuild branch via `.github/workflows/staging-web.yml`.
- **Production**: `app.taskspark.tech` — manual deploy via `.github/workflows/deploy-web.yml` (currently paused with `workflow_dispatch` only — see "Going live" below).

---

## Repo layout (web side)

```
web/
├── index.html        Desktop entry (auto-redirects phone visitors to /m)
├── m/
│   └── index.html    Mobile entry — redirects to /?_m=1, app.js then
│                     replaceState's the URL back to /m for cleanliness
├── app.js            Single-file SPA logic (~7,800 lines)
├── sw.js             Service worker — versioned cache, network-first
│                     for HTML/JS, cache-first for icons/audio
├── manifest.json     PWA manifest
├── oauth-config.js   Google OAuth placeholder (filled at deploy time
│                     via secrets)
├── auth.html, auth-outlook.html  OAuth callback pages
└── assets/           Icons, sounds — managed manually in cPanel
                     (excluded from auto-deploy because of historical
                     file ownership)
```

`WEB_VERSION` lives at the top of `app.js`. The service worker's `CACHE_NAME` lives at the top of `sw.js`. Both must be bumped together when shipping a new version. A comment in `sw.js` reminds you.

---

## Going live (production deploy)

The production workflow `deploy-web.yml` is currently paused (manual trigger only) so accidental pushes during the V4 rebuild don't ship to live. To enable for normal use again:

1. Edit `.github/workflows/deploy-web.yml`. The `on:` block currently has only `workflow_dispatch:`. Add a `push` trigger when ready:

   ```yaml
   on:
     push:
       branches: [main]
       paths:
         - 'web/**'
         - '.github/workflows/deploy-web.yml'
     workflow_dispatch:
   ```

2. Confirm the production secrets are still set (`FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`, `WEB_GOOGLE_CLIENT_ID`, `WEB_GOOGLE_CLIENT_SECRET`).

3. Merge the V4 rebuild branch into `main` (PR + merge).

4. Workflow runs and deploys `web/` to production. Watch Actions tab for green.

5. **One-time after V4 ship**: upload the new PWA icons (`assets/icon-192.png`, `assets/icon-512.png`) to production cPanel via File Manager — they're excluded from auto-deploy because of historical file ownership on the assets folder. Same applies if you ever update `assets/break-chime.mp3`, `assets/taskspark.ico`, etc.

---

## OAuth redirect URIs

Both staging and production need their redirect URIs registered in:

- **Google Cloud Console** → APIs & Services → Credentials → your TaskSpark OAuth client. Authorized redirect URIs should include both:
  - `https://app.taskspark.tech/auth.html`
  - `https://staging.taskspark.tech/auth.html`
- **Microsoft Azure portal** → App registrations → TaskSpark → Authentication → SPA platform redirect URIs:
  - `https://app.taskspark.tech/auth-outlook.html`
  - `https://staging.taskspark.tech/auth-outlook.html`

Without staging URIs registered, sign-in on staging fails with `redirect_uri_mismatch`.

---

## Service worker upgrade — verifying it works

After the first V4 deploy to production, V3.5.1 users will hit the production URL with their old service worker still active. The new SW takes over, deletes the old `taskspark-v34` cache, and the page-side `controllerchange` listener shows the "TaskSpark has updated — refresh" banner.

To verify the upgrade path before shipping:

1. Open production in a clean browser profile (no cached SW).
2. Confirm V3.5.1 loads and the SW registers (Application tab → Service Workers).
3. Trigger a production deploy (push or workflow_dispatch).
4. Refresh the production tab. The new SW installs, takes over, and the refresh banner appears.
5. Click Refresh → V4.0.0 chip shows in the sidebar.

If the banner doesn't appear, the upgrade trap may have come back. Check:
- `sw.js` `CACHE_NAME` actually changed (must be different from the previous deploy's cache name to trigger the activate-deletes-old-caches branch).
- The page is using network-first for HTML (look at the SW's fetch handler).

---

## Manual cPanel deploy (fallback)

If the workflow is broken or you need to deploy without GitHub:

1. Locally: `cd web && zip -r web.zip . -x "*.DS_Store"` to make a flat zip.
2. cPanel → File Manager → navigate to `app.taskspark.tech` document root.
3. Upload `web.zip`.
4. Right-click → Extract. **Use the "overwrite existing" option** (`unzip -o` equivalent).
5. Delete `web.zip`.
6. Edit `oauth-config.js` in File Manager — replace `YOUR_GOOGLE_CLIENT_ID_HERE` and `YOUR_GOOGLE_CLIENT_SECRET_HERE` with the real values.

The deploy workflow does steps 1–6 automatically; this is just for emergencies.

---

## Optional: gzip compression on cPanel

`app.js` is ~380 KB raw, ~120 KB gzipped. Worth a one-time cPanel `.htaccess` add for faster first loads:

```apache
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css text/javascript application/javascript application/json image/svg+xml
</IfModule>

<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType image/png "access plus 1 year"
  ExpiresByType image/x-icon "access plus 1 year"
</IfModule>
```

Append to the existing `.htaccess` in the document root via cPanel File Manager (the FTP user typically can't replace cPanel-managed files, hence why the deploy workflow excludes `**/.htaccess`).
