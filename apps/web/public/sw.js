// Minimal service worker. Chrome will not offer the install prompt without a
// registered worker that handles fetch, so this exists to make the app
// installable — it deliberately caches nothing.
//
// ponytail: no offline support. Add a cache here if the wallet should open
// without a connection; health records must not be cached carelessly.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
