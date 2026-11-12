/** America/Chicago wall time, including daylight-saving changes.
 * The pay week is Monday through Saturday. Sunday is the report send day. */

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

const WEEKDAY_FROM_MONDAY = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export function weekdayOfDutyDate(dutyDate) {
  const noon = chicagoWallToUtc(dutyDate, "12:00");
  if (!noon.ok) return "";
  return chicagoParts(noon.date).weekday;
}

/** Monday–Saturday block that contains a workday. Sunday is not inside a pay week. */
export function payWeekContaining(dutyDate) {
  const weekday = weekdayOfDutyDate(dutyDate);
  if (!weekday || weekday === "Sun") {
    return { inPayWeek: false, weekStart: null, weekEnd: null, sendOn: null, weekStartRule: "monday-saturday" };
  }
  const weekStart = addCalendarDays(dutyDate, -WEEKDAY_FROM_MONDAY[weekday]);
  const weekEnd = addCalendarDays(weekStart, 5);
  return {
    inPayWeek: true,
    weekStart,
    weekEnd,
    sendOn: addCalendarDays(weekStart, 6),
    weekStartRule: "monday-saturday"
  };
}

/** The Monday–Saturday report due on the Sunday after that week.
 * On Sunday this is the week that just ended. On Monday–Saturday it is the open week. */
export function reportWeek(asOf) {
  const duty = dutyDateOf(asOf);
  const anchor = weekdayOfDutyDate(duty) === "Sun" ? addCalendarDays(duty, -1) : duty;
  return payWeekContaining(anchor);
}

export function isInPayWeek(dutyDate, week) {
  return !!dutyDate && !!week && week.inPayWeek !== false && dutyDate >= week.weekStart && dutyDate <= week.weekEnd;
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
