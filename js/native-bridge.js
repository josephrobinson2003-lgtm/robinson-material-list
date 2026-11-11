import { regionsForArm, suggestPin } from "./geofence-policy.js";
import { webTrackingStatus } from "./tracking-status.js";

export function getNativeGeofence() {
  const native = globalThis.RobinsonNative && globalThis.RobinsonNative.geofence;
  if (native && typeof native.armForToday === "function") return native;
  return null;
}

export async function geofenceCapabilities() {
  const native = getNativeGeofence();
  if (!native) return webTrackingStatus();
  const status = await native.getCapabilities();
  return { ...webTrackingStatus(), ...status, deviceTested: false };
}

export async function armTracking(pins) {
  const native = getNativeGeofence();
  if (!native) {
    return {
      ok: false,
      reason: "background-unavailable",
      backgroundGeofence: false
    };
  }
  const regions = regionsForArm(pins, (await native.getCapabilities()).platform);
  if (!regions.ok) return { ok: false, reason: regions.reason, backgroundGeofence: true };
  return native.armForToday({ regions: regions.regions });
}

export function suggestJobFromFix(pins, fix) {
  return suggestPin(pins, fix);
}
