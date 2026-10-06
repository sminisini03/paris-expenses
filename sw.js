// Service worker: cache-first for the app shell so it works fully offline.
// Bump VERSION on every deploy; the app then shows "A new version is ready".

const VERSION = 'v1.0.0';
const CACHE = `paris-expenses-${VERSION}`;
// On localhost, prefer the network so edits show up on reload.
const DEV = ['localhost', '127.0.0.1'].includes(location.hostname);

const SHELL = [
  './',
  'index.html',
  'manifest.json',
  'favicon.ico',
  'css/tokens.css',
  'css/app.css',
  'js/app.js',
  'js/db.js',
  'js/seed.js',
  'js/categories.js',
  'js/rules.js',
  'js/people.js',
  'js/split.js',
  'js/transactions.js',
  'js/export.js',
  'js/import.js',
  'js/balance.js',
  'js/budget.js',
  'js/charts.js',
  'js/format.js',
  'js/settings.js',
  'js/ui.js',
  'js/views/overview-view.js',
  'js/views/transactions-view.js',
  'js/views/charts-view.js',
  'js/views/settings-view.js',
  'js/views/settings-categories.js',
  'js/views/settings-rules.js',
  'js/views/settings-people.js',
  'js/views/tx-form.js',
  'js/views/import-flow.js',
  'js/views/inbox-view.js',
  'js/views/balance-view.js',
  'vendor/inter-latin-wght-normal.woff2',
  'vendor/chart.umd.min.js',
  'vendor/xlsx.mini.min.js',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' bypasses the browser's HTTP cache, so a new version never
  // installs stale copies (GitHub Pages lets files be cached for 10 minutes).
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Navigations always resolve to the shell (routing is hash-based).
    if (request.mode === 'navigate') {
      if (DEV) return fetch(request.url, { cache: 'no-cache' }).catch(() => cache.match('index.html'));
      return (await cache.match('index.html')) ?? fetch(request);
    }
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached && !DEV) return cached;
    try {
      const response = await fetch(request, DEV ? { cache: 'no-cache' } : undefined);
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch (err) {
      if (cached) return cached;
      throw err;
    }
  })());
});
