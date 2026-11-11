/** America/Chicago wall time, including daylight-saving changes.
 * Payroll week boundaries are intentionally not decided here. */

export const TIME_ZONE = "America/Chicago";

function bagFrom(date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  });
  const bag = {};
  for (const part of fmt.formatToParts(date)) bag[part.type] = part.value;
  if (bag.hour === "24") bag.hour = "00";
  return bag;
}

export function chicagoParts(date) {
  const bag = bagFrom(date instanceof Date ? date : new Date(date));
  return {
    year: bag.year,
    month: bag.month,
    day: bag.day,
    hour: bag.hour,
    minute: bag.minute,
    second: bag.second,
    weekday: bag.weekday,
    dutyDate: bag.year + "-" + bag.month + "-" + bag.day
  };
}

export function dutyDateOf(date) {
  return chicagoParts(date).dutyDate;
}

export function chicagoOffsetMinutes(date) {
  const p = chicagoParts(date);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

function sameWall(date, dutyDate, hour, minute) {
  const p = chicagoParts(date);
  return p.dutyDate === dutyDate && Number(p.hour) === hour && Number(p.minute) === minute;
}

function guessUtc(year, month, day, hour, minute, second) {
  let utc = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 4; i += 1) {
    const off = chicagoOffsetMinutes(new Date(utc));
    const next = Date.UTC(year, month - 1, day, hour, minute, second) - off * 60000;
    if (next === utc) return new Date(utc);
    utc = next;
  }
  return new Date(utc);
}

/** Interpret a date and HH:MM as Chicago wall time.
 * Missing and repeated daylight-saving times are rejected instead of guessed. */
export function chicagoWallToUtc(dutyDate, time) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dutyDate || "");
  const clock = /^(\d{2}):(\d{2})$/.exec(time || "");
  if (!match || !clock) return { ok: false, reason: "invalid-wall-time" };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(clock[1]);
  const minute = Number(clock[2]);
  if (hour > 23 || minute > 59) return { ok: false, reason: "invalid-wall-time" };
  const date = guessUtc(year, month, day, hour, minute, 0);
  if (!sameWall(date, dutyDate, hour, minute)) return { ok: false, reason: "time-does-not-exist" };
  if (sameWall(new Date(date.getTime() - 3600000), dutyDate, hour, minute)) return { ok: false, reason: "time-ambiguous" };
  if (sameWall(new Date(date.getTime() + 3600000), dutyDate, hour, minute)) return { ok: false, reason: "time-ambiguous" };
  return { ok: true, date };
}

export function formatChicagoIso(date) {
  const p = chicagoParts(date);
  const offset = chicagoOffsetMinutes(date);
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return p.dutyDate + "T" + p.hour + ":" + p.minute + ":" + p.second + sign + hh + ":" + mm;
}

export function formatChicagoLabel(date) {
  const value = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(value);
}

export function formatChicagoDay(dutyDate) {
  const parsed = chicagoWallToUtc(dutyDate, "12:00");
  if (!parsed.ok) return dutyDate;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(parsed.date);
}

export function addCalendarDays(dutyDate, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dutyDate || "");
  if (!match) return "";
  const dt = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3] + days));
  return dt.toISOString().slice(0, 10);
}

export function elapsedMinutes(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 60000);
}
