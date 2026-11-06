// Offline support for the web app: the app shell and question bank are cached on
// first visit; each talk's captions are cached the first time it is opened.
const VERSION = "lotus-v9";
const SHELL = [
  "./", "index.html", "style.css", "app.js", "print.js", "group.js", "qr.js", "data.js",
  "manifest.webmanifest", "fonts/fonts.css", "icons/icon-192.png", "icons/icon-512.png"
];

self.addEventListener("install", e => {
  // cache: "reload" skips the browser's HTTP cache (the host keeps scripts for 7 days), so an update gets the new files.
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.endsWith("/room.php")) return; // a live game: never from the cache
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  })));
});
