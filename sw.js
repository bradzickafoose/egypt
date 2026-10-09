// Egypt companion — offline cache. The page opens from cache instantly and refreshes in the background;
// a new build bumps V, the new worker fetches a fresh page on install, and the page reloads itself onto it.
const V = "egypt-v89";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
self.addEventListener("message", e => { if (e.data && e.data.type === "SKIP") self.skipWaiting(); });
const prefetch = async () => { const c = await caches.open(V); for (const u of CORE) { try { const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 20000); const r = await fetch(u, { cache: "reload", signal: ctrl.signal }); clearTimeout(tm); if (r && r.ok) await c.put(u, r); } catch (e) {} } };
self.addEventListener("install", e => { e.waitUntil(prefetch().catch(() => {}).then(() => self.skipWaiting())); });
// old caches are dropped only once this version has the page itself, so an update that installed on a dead signal never leaves the phone with nothing
const tidy = async () => { try { const c = await caches.open(V); if (!(await c.match("./index.html"))) return; const ks = await caches.keys(); await Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))); } catch (e) {} };
self.addEventListener("activate", e => { e.waitUntil(self.clients.claim().then(tidy)); });
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin || url.hostname.endsWith("open-meteo.com")) {
    e.respondWith((async () => {
      const cache = await caches.open(V);
      const fresh = req.mode === "navigate" || /index\.html$|\/$/.test(url.pathname);
      if (fresh) {
        // cache first, revalidate behind: instant open on one bar of 4G
        const hit = await cache.match(req, { ignoreSearch: true }) || await cache.match("./index.html") || await caches.match("./index.html");
        const net = (async () => { try { const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), hit ? 12000 : 25000); const r = await fetch(new Request(url.origin + url.pathname, { cache: "no-cache", credentials: "same-origin" }), { signal: ctrl.signal }); clearTimeout(tm); if (r && r.ok) { await cache.put("./index.html", r.clone()); await cache.put("./", r.clone()); tidy(); } return r; } catch (err) { return null; } })();
        if (hit) { e.waitUntil(net); return hit; }
        const r = await net; if (r) return r; throw new Error("offline, nothing cached");
      }
      try {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(req, { signal: ctrl.signal }); clearTimeout(t);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await cache.match(req, { ignoreSearch: true }); if (hit) return hit;
        throw err;
      }
    })());
  } else {
    // fonts and the like: cache a copy once seen, serve it when offline
    e.respondWith((async () => {
      const cache = await caches.open(V); const hit = await cache.match(req);
      // never let a font or a third-party asset hang the worker: a stuck fetch event blocks the next update from activating
      const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 8000);
      const net = fetch(req, { signal: ctrl.signal }).then(res => { clearTimeout(tm); if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; }).catch(() => { clearTimeout(tm); return hit || Response.error(); });
      return hit || net;
    })());
  }
});
