/* Robinson Electrical Material List - offline shell cache.
   Lists are stored in localStorage by the page, never in this cache.
   Bump CACHE when shipping a new version so a home-screen install
   drops the old shell and loads the new one after the app is reopened. */
var CACHE = "re-material-20261002b";
var ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    self.clients.matchAll({ type: "window" }).then(function (openClients) {
      return caches.keys().then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k.indexOf("re-material-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
      }).then(function () { return self.clients.claim(); }).then(function () {
        /* A controlled window means this is an update, not the first install.
           Reload it so a home-screen reopen shows the new page on this launch.
           The previous app started blank, so this does not discard a saved list. */
        if (!openClients.length) return;
        return self.clients.matchAll({ type: "window" }).then(function (clients) {
          clients.forEach(function (client) {
            if (typeof client.navigate === "function") client.navigate(client.url);
          });
        });
      });
    })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    /* Bypass the host's short HTTP cache so a reopened home-screen app
       gets this version instead of a cached copy of index.html. */
    e.respondWith(fetch(req, { cache: "no-store" }).then(storeIndex, function () {
      return fetch(req).then(storeIndex);
    }).catch(function () { return caches.match("./index.html"); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req); }));
});

function storeIndex(res) {
  if (res && res.ok) {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put("./index.html", copy); });
  }
  return res;
}
