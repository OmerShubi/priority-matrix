// Priority Matrix — offline cache.
// App shell: network-first (so deploys show up), cache fallback.
// CDN files (Firebase SDK — versioned URLs — and the web font): cache-first.
// Firebase auth/Firestore traffic is never intercepted.
// Paths are relative so this works at a domain root (Firebase Hosting)
// and under /priority-matrix/ (GitHub Pages).
const CACHE = "priority-matrix-v1";
const SHELL = new URL("./", self.location).href;
const CDN_HOSTS = ["www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(["./", "manifest.webmanifest", "icon-512.png", "apple-touch-icon.png"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.pathname.startsWith("/__/")) return; // firebase auth helpers

  if (e.request.mode === "navigate") {
    const page = url.origin + url.pathname;
    const isShell = page === SHELL || page === SHELL + "index.html";
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok && isShell) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(SHELL, copy));
          }
          return res;
        })
        .catch(() => caches.match(SHELL))
    );
    return;
  }

  const cdn = CDN_HOSTS.includes(url.hostname);
  if (!cdn && (url.hostname.endsWith("googleapis.com") || url.hostname.endsWith("google.com"))) return;

  if (url.origin === location.origin || cdn) {
    e.respondWith(
      caches.match(e.request).then(hit =>
        hit ||
        fetch(e.request).then(res => {
          if (res.ok || res.type === "opaque") {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return res;
        })
      )
    );
  }
});
