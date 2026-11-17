// The build prepends VERSION and FILES (paths relative to this script).

const CACHE = `freecell-${VERSION}`;
const scoped = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Bypass the HTTP cache so a fresh deploy never precaches the previous index.html.
      .then((cache) => cache.addAll(FILES.map((path) => new Request(scoped(path), { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('freecell-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  // Every page address is the one app with a different deal in the query.
  const key = request.mode === 'navigate' ? scoped('index.html') : request;
  event.respondWith(caches.match(key, { ignoreSearch: true }).then((hit) => hit ?? fetch(request)));
});
