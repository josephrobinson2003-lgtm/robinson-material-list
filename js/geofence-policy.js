/** On-device job matching. Raw coordinates are not a route and are not an export. */

export const MIN_RADIUS_METERS = 150;
/** A geocoded street address is the parcel centre, not where the truck parks. */
export const ADDRESS_RADIUS_METERS = 250;
export const MAX_ACCURACY_METERS = 150;
export const IOS_REGION_LIMIT = 20;
export const ANDROID_REGION_LIMIT = 100;

export function assessAccuracy(accuracyMeters) {
  if (accuracyMeters == null || !Number.isFinite(Number(accuracyMeters))) {
    return { quality: "unknown", suggestMatch: false, reason: "accuracy-unavailable" };
  }
  const accuracy = Number(accuracyMeters);
  if (accuracy > MAX_ACCURACY_METERS) {
    return { quality: "low", suggestMatch: false, reason: "accuracy-worse-than-150m", accuracyMeters: accuracy };
  }
  return { quality: "ok", suggestMatch: true, accuracyMeters: accuracy };
}

export function assessGeofenceEvent({ optIn, armedDutyDate, eventDutyDate, accuracyMeters }) {
  if (!optIn || !armedDutyDate) {
    return { action: "ignore", reason: "off-duty", persistCoordinates: false };
  }
  if (armedDutyDate !== eventDutyDate) {
    return { action: "disarm", reason: "duty-date-ended", persistCoordinates: false };
  }
  const accuracy = assessAccuracy(accuracyMeters);
  return {
    action: "suggest",
    lowAccuracy: !accuracy.suggestMatch,
    accuracyReason: accuracy.reason,
    persistCoordinates: false
  };
}

function toRad(deg) { return deg * Math.PI / 180; }

export function distanceMeters(aLat, aLon, bLat, bLon) {
  const earth = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Foreground, one-shot help. Never starts an interval. */
export function suggestPin(pins, fix) {
  const accuracy = assessAccuracy(fix && fix.accuracyMeters);
  if (!fix || !Number.isFinite(Number(fix.latitude)) || !Number.isFinite(Number(fix.longitude))) {
    return { match: null, reason: "no-fix" };
  }
  if (!accuracy.suggestMatch) {
    return { match: null, reason: accuracy.reason, accuracyMeters: accuracy.accuracyMeters ?? null };
  }
  const hits = [];
  const seen = new Set();
  for (const pin of pins || []) {
    const lat = Number(pin && pin.latitude);
    const lon = Number(pin && pin.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue;
    if (seen.has(pin.jobId)) continue;
    const address = pin.source === "address";
    const floor = address ? ADDRESS_RADIUS_METERS : MIN_RADIUS_METERS;
    const radius = Math.max(floor, Number(pin.radiusMeters) || floor);
    const distance = distanceMeters(Number(fix.latitude), Number(fix.longitude), lat, lon);
    /* A spot saved on site must fit inside the circle with its error bar.
       A geocoded address only needs the fix itself inside the wider circle. */
    const inside = address ? distance <= radius : distance + accuracy.accuracyMeters <= radius;
    if (inside) { hits.push({ pin, distance }); seen.add(pin.jobId); }
  }
  hits.sort((a, b) => a.distance - b.distance);
  if (hits.length === 1) {
    return { match: { jobId: hits[0].pin.jobId, jobLabel: hits[0].pin.jobLabel }, reason: hits[0].pin.source === "address" ? "job-address" : "one-saved-job", distanceMeters: Math.round(hits[0].distance) };
  }
  if (hits.length > 1 && hits[0].distance * 2 < hits[1].distance) {
    return { match: { jobId: hits[0].pin.jobId, jobLabel: hits[0].pin.jobLabel }, reason: "nearest-job", distanceMeters: Math.round(hits[0].distance) };
  }
  if (hits.length > 1) return { match: null, reason: "ambiguous", candidates: hits.slice(0, 3).map((hit) => hit.pin.jobLabel) };
  return { match: null, reason: "none-nearby" };
}

export function regionsForArm(pins, platform) {
  const list = pins || [];
  const limit = platform === "ios" ? IOS_REGION_LIMIT : ANDROID_REGION_LIMIT;
  if (list.length > limit) return { ok: false, reason: "too-many-sites", limit };
  return {
    ok: true,
    regions: list.map((pin) => ({
      jobId: pin.jobId,
      jobLabel: pin.jobLabel,
      latitude: pin.latitude,
      longitude: pin.longitude,
      radiusMeters: Math.max(pin.source === "address" ? ADDRESS_RADIUS_METERS : MIN_RADIUS_METERS, Number(pin.radiusMeters) || MIN_RADIUS_METERS)
    }))
  };
}

export function stripCoordinates(value) {
  if (Array.isArray(value)) return value.map(stripCoordinates);
  if (!value || typeof value !== "object") return value;
  const blocked = new Set(["latitude", "longitude", "lat", "lon", "lng", "coords", "coordinates", "pins", "addressPins", "accuracyMeters"]);
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (blocked.has(key)) continue;
    out[key] = stripCoordinates(item);
  }
  return out;
}

/** Saved on-site spots win over a geocoded address for the same job. */
export function combinePins(savedPins, addressPins) {
  const saved = (savedPins || []).filter(Boolean);
  const have = new Set(saved.map((pin) => pin.jobId));
  return saved.concat((addressPins || []).filter((pin) => pin && !have.has(pin.jobId)));
}

/** Turn the server's geocode answer into pins kept only on this phone. */
export function addressPinsFromServer(rows, jobIdFor) {
  return (rows || []).map((row) => {
    const lat = Number(row && row.latitude);
    const lon = Number(row && row.longitude);
    if (!row || !row.address || !Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { jobId: jobIdFor(row.address), jobLabel: row.address, latitude: lat, longitude: lon, radiusMeters: ADDRESS_RADIUS_METERS, source: "address" };
  }).filter((pin) => pin && pin.jobId);
}
