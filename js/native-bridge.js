import { regionsForArm, suggestPin } from "./geofence-policy.js";
import { webTrackingStatus } from "./tracking-status.js";

let capacitorGeofence = null;

function fromCapacitor() {
  const cap = globalThis.Capacitor;
  if (!cap) return null;
  const native = typeof cap.isNativePlatform === "function" ? cap.isNativePlatform() : !!cap.isNative;
  if (!native) return null;
  if (capacitorGeofence) return capacitorGeofence;
  if (cap.Plugins && cap.Plugins.RobinsonGeofence && typeof cap.Plugins.RobinsonGeofence.armForToday === "function") {
    capacitorGeofence = cap.Plugins.RobinsonGeofence;
  } else if (typeof cap.registerPlugin === "function") {
    capacitorGeofence = cap.registerPlugin("RobinsonGeofence");
  } else if (typeof cap.nativePromise === "function") {
    const call = (method) => (options) => cap.nativePromise("RobinsonGeofence", method, options || {});
    capacitorGeofence = {};
    ["getCapabilities", "requestLocation", "armForToday", "disarm", "getPendingEvents", "ackEvents", "saveToken"].forEach((method) => { capacitorGeofence[method] = call(method); });
  }
  return capacitorGeofence;
}

/** The Android/iOS plugin. Before 1.8.2 nothing connected it, so the app always behaved like a browser. */
export function getNativeGeofence() {
  const legacy = globalThis.RobinsonNative && globalThis.RobinsonNative.geofence;
  if (legacy && typeof legacy.armForToday === "function") return legacy;
  const native = fromCapacitor();
  if (native && typeof native.armForToday === "function") return native;
  return null;
}

export async function requestNativeLocation() {
  const native = getNativeGeofence();
  if (!native || typeof native.requestLocation !== "function") return { ok: false, reason: "no-native" };
  try { return { ok: true, ...(await native.requestLocation()) }; }
  catch (err) { return { ok: false, reason: (err && err.message) || "request-failed" }; }
}

export async function geofenceCapabilities() {
  const native = getNativeGeofence();
  if (!native) return webTrackingStatus();
  const status = await native.getCapabilities();
  return { ...webTrackingStatus(), ...status, deviceTested: false };
}

export async function armTracking(pins, dutyDate) {
  const native = getNativeGeofence();
  if (!native) {
    return {
      ok: false,
      reason: "background-unavailable",
      backgroundGeofence: false
    };
  }
  if (!(pins || []).length) return { ok: false, reason: "no-job-locations", backgroundGeofence: true };
  if (typeof native.requestLocation === "function") {
    try { await native.requestLocation({ background: true }); } catch { /* armForToday reports what is missing */ }
  }
  const regions = regionsForArm(pins, (await native.getCapabilities()).platform);
  if (!regions.ok) return { ok: false, reason: regions.reason, backgroundGeofence: true };
  try {
    const armed = await native.armForToday({ regions: regions.regions, dutyDate });
    return { ok: true, ...armed };
  } catch (err) {
    return { ok: false, reason: (err && (err.message || err.code)) || "arm-failed", backgroundGeofence: true };
  }
}

export function suggestJobFromFix(pins, fix) {
  return suggestPin(pins, fix);
}
