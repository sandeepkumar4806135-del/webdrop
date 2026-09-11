// Minimal service worker: satisfies PWA installability (fetch handler +
// app-shell caching) without pretending WebDrop works offline — the actual
// pairing/transfer flow always needs the network. Served from /sw.js.
//
// Caching strategy (stale-app-shell fix):
//   - Bump CACHE_VERSION below every time this file's behavior changes, so
//     each deployment gets a distinct cache name. The activate handler then
//     deletes every cache with an older name, so stale shells never linger.
//   - NAVIGATIONS (HTML) are NETWORK-FIRST: we always try the latest page
//     from the server and only fall back to the cached copy when offline.
//     This is what prevents installed PWAs from showing an old build after
//     a deploy — the previous cache-first behavior served stale HTML instantly.
//   - Static assets (/_next/static/*, icons) stay cache-first: Next.js gives
//     them unique content-hashed filenames per build, so "stale" entries are
//     impossible (a new build gets new URLs). Old hashed files for the
//     previous version get cleaned up with the old cache on activate.
//   - API traffic (/api/*) is never intercepted — pairing/signaling must
//     always be live.
const CACHE_VERSION = "v2";
const CACHE = `webdrop-shell-${CACHE_VERSION}`;
const SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  // skipWaiting: the freshly deployed SW activates immediately instead of
  // waiting for every open PWA instance/tab to close first.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

// The page can also nudge a waiting worker to activate right away.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      // clients.claim: take control of already-open pages right away so they
      // get the new fetch behavior without a manual close/reopen.
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Never cache pairing/signaling traffic — it must always be live.
  if (url.pathname.startsWith("/api/")) return;
  if (url.origin !== self.location.origin) return;

  // NAVIGATIONS (HTML page loads): NETWORK-FIRST. Always try the newest
  // version from the network; only use the cached shell if the network
  // request fails (offline). This is the fix for the stale-app problem.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          // Offline: serve the cached page (or the shell root as a fallback).
          caches
            .match(req)
            .then((hit) => hit || caches.match("/"))
            .then(
              (hit) =>
                hit ||
                new Response("Offline", { status: 503, statusText: "Offline" }),
            ),
        ),
    );
    return;
  }

  // Everything else (hashed /_next/static assets, icons, fonts): CACHE-FIRST
  // with background refresh. Safe to be aggressive because Next.js asset
  // URLs are content-hashed per build — a new build means new URLs.
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
});
