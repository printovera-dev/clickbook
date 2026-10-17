/* ClickBook service worker — WEB TARGET ONLY.
 * Caches same-origin static assets (icons, manifest, fonts, bundled images) cache-first and serves the app shell
 * network-first with an offline fallback to the last cached copy. API calls (/api/*) are never cached. */
const VERSION = "clickbook-v6";
const STATIC = `${VERSION}-static`;
const SHELL = `${VERSION}-shell`;
const PRECACHE = ["/manifest.json", "/favicon.svg?v=5", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

const isStatic = (url) => /\.(png|jpg|jpeg|webp|svg|ico|ttf|otf|woff2?|css)$/i.test(url.pathname) || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.json";

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (isStatic(url)) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type !== "opaque") {
        // Clone exactly once before returning the original response to the browser.
        const cacheCopy = res.clone();
        event.waitUntil(caches.open(STATIC).then((cache) => cache.put(req, cacheCopy)).catch(() => {}));
      }
      return res;
    })());
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && res.type !== "opaque") {
          const cacheCopy = res.clone();
          event.waitUntil(caches.open(SHELL).then((cache) => cache.put("/", cacheCopy)).catch(() => {}));
        }
        return res;
      } catch {
        return (await caches.match("/")) || Response.error();
      }
    })());
  }
});
