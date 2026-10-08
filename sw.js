// Egypt companion — offline cache. Network first so updates arrive immediately; cache when the signal is gone.
const V = "egypt-v39";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin || url.hostname.endsWith("open-meteo.com")) {
    e.respondWith((async () => {
      const cache = await caches.open(V);
      try {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(req, { signal: ctrl.signal }); clearTimeout(t);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await cache.match(req, { ignoreSearch: true }); if (hit) return hit;
        if (req.mode === "navigate") { const idx = await cache.match("./index.html"); if (idx) return idx; }
        throw err;
      }
    })());
  } else {
    // fonts and the like: cache a copy once seen, serve it when offline
    e.respondWith((async () => {
      const cache = await caches.open(V); const hit = await cache.match(req);
      const net = fetch(req).then(res => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })());
  }
});
