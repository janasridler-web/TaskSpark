// CACHE_NAME must be bumped whenever WEB_VERSION in app.js bumps.
// Cache name change is what forces clients onto fresh assets.
const CACHE_NAME = 'taskspark-v4.0.8';

const ASSETS = [
  '/',
  '/index.html',
  '/m/',
  '/m/index.html',
  '/app.js',
  '/oauth-config.js',
  '/manifest.json',
  '/assets/taskspark_sidebar.png',
  '/assets/taskspark.ico',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/break-chime.mp3'
];

self.addEventListener('install', e => {
  // Tolerant precache: a single missing asset shouldn't fail the whole
  // install. Each file is attempted individually; failures warn only.
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(
        ASSETS.map(asset =>
          cache.add(asset).catch(err =>
            console.warn('[sw] precache failed for', asset, err)
          )
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Belt-and-braces: page can also tell SW to skip waiting if it ever gets
// stuck in the waiting state (e.g., open in multiple tabs).
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Bypass: API and OAuth — never cache, never intercept.
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('accounts.google.com') ||
      url.hostname.includes('login.microsoftonline.com') ||
      url.hostname.includes('graph.microsoft.com') ||
      url.pathname.includes('oauth')) {
    return;
  }

  // Network-first for HTML and JS so version bumps deploy immediately
  // and we never get stuck on a stale cache. Falls back to cache offline.
  const isAppShell = e.request.mode === 'navigate'
    || url.pathname.endsWith('.html')
    || url.pathname.endsWith('.js');

  if (isAppShell) {
    // Fall back to /m/index.html when the user is on the /m route, otherwise
    // to /index.html. Keeps the experience right when offline on either path.
    const fallbackHtml = url.pathname.startsWith('/m') ? '/m/index.html' : '/index.html';
    e.respondWith(
      fetch(e.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() =>
        caches.match(e.request).then(c => c || caches.match(fallbackHtml))
      )
    );
    return;
  }

  // Cache-first for static assets (icons, audio, manifest).
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      });
    }).catch(() => caches.match('/index.html'))
  );
});
