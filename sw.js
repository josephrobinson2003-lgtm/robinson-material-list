/* Robinson Electrical Material List - offline shell cache.
   Lists are stored in localStorage by the page, never in this cache.
   Bump CACHE when shipping a new version so a home-screen install
   drops the old shell and loads the new one after the app is reopened. */
var CACHE = "re-material-20261113g";
var ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./logo.png", "./favicon.ico", "./favicon-32.png", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png", "./js/chicago-time.js", "./js/ids.js", "./js/timecard-model.js", "./js/geofence-policy.js", "./js/export-contract.js", "./js/employee-boundary.js", "./js/backend.js", "./js/device-config.js", "./js/sync-queue.js", "./js/jobs.js", "./js/exif.js", "./js/job-photos.js", "./js/photo-paths.js", "./js/photo-backend.js", "./js/storage.js", "./js/native-bridge.js", "./js/secure-store.js", "./js/privacy-notice.js", "./js/tracking-status.js", "./js/pay-rules.js", "./js/holiday-theme.js", "./js/crew-ui.js",
  "./holiday/arbor-day/leaf-1.webp", "./holiday/arbor-day/leaf-2.webp", "./holiday/arbor-day/leaf-3.webp", "./holiday/arbor-day/sapling.webp", "./holiday/arbor-day/seed.webp", "./holiday/arbor-day/sprout.webp", "./holiday/arbor-day/tree.webp", "./holiday/arbor-day/vine.webp",
  "./holiday/christmas/sleigh.webp",
  "./holiday/earth-day/globe.webp", "./holiday/earth-day/leaf-1.webp", "./holiday/earth-day/leaf-2.webp", "./holiday/earth-day/leaf-3.webp", "./holiday/earth-day/leaf-4.webp", "./holiday/earth-day/leaf-5.webp", "./holiday/earth-day/leaf-6.webp", "./holiday/earth-day/sprout.webp",
  "./holiday/easter/basket.webp", "./holiday/easter/bunny.webp", "./holiday/easter/egg-1.webp", "./holiday/easter/egg-2.webp", "./holiday/easter/egg-3.webp", "./holiday/easter/egg-4.webp", "./holiday/easter/egg-5.webp",
  "./holiday/fathers-day/driver.webp", "./holiday/fathers-day/grill.webp", "./holiday/fathers-day/tie.webp", "./holiday/fathers-day/toolbox.webp",
  "./holiday/groundhog/hog.webp", "./holiday/groundhog/mound.webp",
  "./holiday/labor-day/electrician.webp",
  "./holiday/mothers-day/flower-1.webp", "./holiday/mothers-day/flower-2.webp", "./holiday/mothers-day/flower-4.webp", "./holiday/mothers-day/heart.webp", "./holiday/mothers-day/petal-1.webp", "./holiday/mothers-day/petal-2.webp", "./holiday/mothers-day/petal-3.webp", "./holiday/mothers-day/petal-4.webp",
  "./holiday/thanksgiving/fan.webp", "./holiday/thanksgiving/walk.webp"];

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
