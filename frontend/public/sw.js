// Minimal service worker: satisfies PWA installability (fetch handler +
// app-shell caching) without pretending WebDrop works offline — the actual
// pairing/transfer flow always needs the network. Served from /sw.js.
// Strategy: cache the app shell + static assets on install (cache-first for
// GET navigations/assets), and always let API calls (pairing/signaling) fall
// through to the network so live sessions never serve stale data.
const CACHE = "webdrop-shell-v1";
const SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Never cache pairing/signaling traffic — it must always be live.
  if (url.pathname.startsWith("/api/")) return;
  // Cache-first for same-origin navigations/assets: serve cached shell when
  // offline, otherwise fetch and refresh the cache in the background.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const fetched = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(req, copy));
            }
            return res;
          })
          .catch(() => hit);
        return hit || fetched;
      }),
    );
  }
});
