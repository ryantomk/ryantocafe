/* SERVICE WORKER: lets the site be installed and open without internet.
   It only touches files from your own website (never other sites, never payments). */
const CACHE = 'ryanto-v1'; // change this name (v2, v3...) when you want every phone to refresh its saved files
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

/* INSTALL: save the main files on the phone */
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
/* ACTIVATE: delete old saved versions */
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
/* FETCH: try the internet first (so updates show up), fall back to the saved copy when offline */
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // ignore other websites completely
  e.respondWith(
    fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req).then(m => m || caches.match('index.html')))
  );
});
