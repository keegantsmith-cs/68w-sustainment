// Offline support: caches the app shell, and any document a user opens.
// Bump VERSION whenever you change the app files so phones pick up the update.
const VERSION = "68w-v8";
const SHELL = ["./", "index.html", "css/styles.css", "js/ictl.js", "js/cpg.js", "js/adtmc.js", "js/drugref.js", "js/data.js", "js/art.js", "js/app.js", "assets/icon.svg", "manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Network first, fall back to cache when offline.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
