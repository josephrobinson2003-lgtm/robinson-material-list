import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { suggestPin, combinePins, addressPinsFromServer, regionsForArm, ADDRESS_RADIUS_METERS, stripCoordinates } from "../js/geofence-policy.js";
import { getNativeGeofence, armTracking } from "../js/native-bridge.js";
import { jobIdForLabel } from "../js/ids.js";

// 1509 Mautenne Dr, Ballwin (approx.) and a point ~120 m east, ~600 m east.
const SITE = { lat: 38.5951, lon: -90.5462 };
const near = { latitude: SITE.lat, longitude: SITE.lon + 0.00138, accuracyMeters: 40 };
const far = { latitude: SITE.lat, longitude: SITE.lon + 0.0069, accuracyMeters: 20 };
const addressPin = addressPinsFromServer([{ address: "1509 Mautenne Dr", latitude: SITE.lat, longitude: SITE.lon }], jobIdForLabel)[0];

test("a geocoded job address is suggested when standing near it", () => {
  assert.equal(addressPin.source, "address");
  assert.equal(addressPin.radiusMeters, ADDRESS_RADIUS_METERS);
  const hit = suggestPin([addressPin], near);
  assert.equal(hit.match && hit.match.jobLabel, "1509 Mautenne Dr");
  assert.equal(hit.reason, "job-address");
  assert.equal(suggestPin([addressPin], far).reason, "none-nearby");
});

test("1.8.1 behavior: with no saved spots nothing could ever match", () => {
  assert.equal(suggestPin([], near).reason, "none-nearby");
});

test("saved on-site spots keep the strict rule and win over the address", () => {
  const spot = { jobId: addressPin.jobId, jobLabel: "1509 Mautenne Dr", latitude: SITE.lat, longitude: SITE.lon };
  const pins = combinePins([spot], [addressPin]);
  assert.equal(pins.length, 1);
  assert.equal(pins[0], spot);
  assert.equal(suggestPin(pins, { ...near, accuracyMeters: 140 }).reason, "none-nearby");
});

test("two jobs nearby: clear nearest wins, close call stays ambiguous", () => {
  const other = addressPinsFromServer([{ address: "1520 Mautenne Dr", latitude: SITE.lat, longitude: SITE.lon + 0.0025 }], jobIdForLabel)[0];
  const atSite = { latitude: SITE.lat, longitude: SITE.lon + 0.0002, accuracyMeters: 20 };
  assert.equal(suggestPin([addressPin, other], atSite).reason, "nearest-job");
  const between = { latitude: SITE.lat, longitude: SITE.lon + 0.00125, accuracyMeters: 20 };
  assert.equal(suggestPin([addressPin, other], between).reason, "ambiguous");
});

test("bad geocodes are dropped and coordinates never leave in exports", () => {
  const pins = addressPinsFromServer([
    { address: "A", latitude: 0, longitude: 0 },
    { address: "B", latitude: "", longitude: "" },
    { address: "C", latitude: 200, longitude: 10 },
    { address: "", latitude: 38, longitude: -90 }
  ], jobIdForLabel);
  assert.equal(pins.length, 0);
  assert.equal(stripCoordinates({ addressPins: [addressPin], pins: [], ok: 1 }).addressPins, undefined);
  assert.equal(regionsForArm([addressPin], "android").regions[0].radiusMeters, ADDRESS_RADIUS_METERS);
});

test("the Android plugin is reached through Capacitor", async () => {
  const calls = [];
  globalThis.Capacitor = {
    isNativePlatform: () => true,
    registerPlugin: (name) => {
      calls.push("register:" + name);
      return {
        getCapabilities: async () => ({ platform: "android", backgroundGeofence: true, authorization: "always" }),
        requestLocation: async (o) => { calls.push("request:" + !!(o && o.background)); return { authorization: "always" }; },
        armForToday: async ({ regions }) => { calls.push("arm:" + regions.length); return { armed: true }; }
      };
    }
  };
  try {
    assert.ok(getNativeGeofence());
    assert.equal((await armTracking([], "2026-11-24")).reason, "no-job-locations");
    const armed = await armTracking([addressPin], "2026-11-24");
    assert.equal(armed.ok, true);
    assert.deepEqual(calls, ["register:RobinsonGeofence", "request:true", "arm:1"]);
  } finally {
    delete globalThis.Capacitor;
  }
});

test("Android plugin asks for location at runtime", () => {
  const kotlin = readFileSync(new URL("../native/plugins/robinson-geofence/android/src/main/kotlin/com/robinsonelectrical/geofence/RobinsonGeofencePlugin.kt", import.meta.url), "utf8");
  assert.match(kotlin, /fun requestLocation/);
  assert.match(kotlin, /alias = "location"/);
  assert.match(kotlin, /"authorization"/);
});
