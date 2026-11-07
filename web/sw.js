// Service worker minimal : met en cache l'interface pour le faible débit. Les conversations ne sont jamais mises en cache.
// Changer CACHE à chaque modification de web/ pour forcer la mise à jour chez les utilisatrices.
const CACHE = 'jnj-v6';
const ASSETS = ['/', '/styles.css', '/app.js', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png'];
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});
self.addEventListener('activate', (e) =>
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
);
// Réseau d'abord (version à jour), cache en secours (hors ligne / réseau faible).
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api') || url.pathname.startsWith('/webhook')) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok && ASSETS.includes(url.pathname)) {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
