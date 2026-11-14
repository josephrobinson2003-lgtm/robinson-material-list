/* Robinson Electrical Material List - offline shell cache.
   Lists are stored in localStorage by the page, never in this cache.
   Bump CACHE when shipping a new version so a home-screen install
   drops the old shell and loads the new one after the app is reopened. */
var CACHE = "re-material-20261114d";
var ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./logo.png", "./favicon.ico", "./favicon-32.png", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png", "./js/chicago-time.js", "./js/ids.js", "./js/timecard-model.js", "./js/geofence-policy.js", "./js/export-contract.js", "./js/employee-boundary.js", "./js/backend.js", "./js/device-config.js", "./js/sync-queue.js", "./js/jobs.js", "./js/exif.js", "./js/job-photos.js", "./js/photo-paths.js", "./js/photo-backend.js", "./js/storage.js", "./js/native-bridge.js", "./js/secure-store.js", "./js/privacy-notice.js", "./js/tracking-status.js", "./js/pay-rules.js", "./js/holiday-theme.js", "./js/crew-ui.js",
  "./holiday/arbor-day/leaf-1.webp", "./holiday/arbor-day/leaf-2.webp", "./holiday/arbor-day/leaf-3.webp", "./holiday/arbor-day/sapling.webp", "./holiday/arbor-day/seed.webp", "./holiday/arbor-day/sprout.webp", "./holiday/arbor-day/tree.webp", "./holiday/arbor-day/vine.webp",
  "./holiday/christmas/sleigh.webp",
  "./holiday/earth-day/globe.webp", "./holiday/earth-day/leaf-1.webp", "./holiday/earth-day/leaf-2.webp", "./holiday/earth-day/leaf-3.webp", "./holiday/earth-day/leaf-4.webp", "./holiday/earth-day/leaf-5.webp", "./holiday/earth-day/leaf-6.webp", "./holiday/earth-day/sprout.webp",
  "./holiday/easter/basket.webp", "./holiday/easter/bunny.webp", "./holiday/easter/egg-1.webp", "./holiday/easter/egg-2.webp", "./holiday/easter/egg-3.webp", "./holiday/easter/egg-4.webp", "./holiday/easter/egg-5.webp",
  "./holiday/fathers-day/driver.webp", "./holiday/fathers-day/grill.webp", "./holiday/fathers-day/tie.webp", "./holiday/fathers-day/toolbox.webp",
  "./holiday/groundhog/hog.webp", "./holiday/groundhog/mound.webp",
  "./holiday/labor-day/electrician.webp",
  "./holiday/mothers-day/flower-1.webp", "./holiday/mothers-day/flower-2.webp", "./holiday/mothers-day/flower-4.webp", "./holiday/mothers-day/heart.webp", "./holiday/mothers-day/petal-1.webp", "./holiday/mothers-day/petal-2.webp", "./holiday/mothers-day/petal-3.webp", "./holiday/mothers-day/petal-4.webp",
  "./holiday/thanksgiving/fan.webp", "./holiday/thanksgiving/walk.webp",
  "./holiday/leaves/maple-red.webp", "./holiday/leaves/maple-orange.webp", "./holiday/leaves/maple-gold.webp", "./holiday/leaves/maple-burgundy.webp", "./holiday/leaves/oak-brown.webp", "./holiday/leaves/oak-rust.webp",
  "./holiday/christmas/tree.webp", "./holiday/new-year/party.webp", "./holiday/july-4/sparkler.webp", "./holiday/flags/us-flag.webp",
  "./holiday/veterans/folded-flag.webp", "./holiday/memorial-day/poppies.webp", "./holiday/halloween/yard.webp", "./holiday/halloween/ghost.webp",
  "./holiday/valentines/roses.webp", "./holiday/valentines/heart.webp", "./holiday/st-patricks/leprechaun.webp", "./holiday/st-patricks/pot.webp", "./holiday/st-patricks/shamrock.webp",
  "./holiday/mlk/dove.webp", "./holiday/presidents/hat.webp", "./holiday/juneteenth/flag.webp", "./holiday/peoples-day/harvest.webp",
  "./fonts/holiday.css", "./fonts/mountains-of-christmas.woff2", "./fonts/great-vibes.woff2", "./fonts/pinyon-script.woff2", "./fonts/creepster.woff2", "./fonts/irish-grover.woff2", "./fonts/stardos-stencil.woff2", "./fonts/cinzel-decorative.woff2", "./fonts/libre-baskerville.woff2", "./fonts/fredoka.woff2", "./fonts/patrick-hand.woff2", "./fonts/caveat.woff2", "./fonts/quicksand.woff2", "./fonts/oswald.woff2", "./fonts/righteous.woff2", "./fonts/playfair-display.woff2"];

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
