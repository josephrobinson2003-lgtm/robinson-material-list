/** Holiday marks for the logo. Dates are America/Chicago calendar days.
 * The logo file itself is never changed. A month is split at the midpoint
 * between consecutive holidays. A month with no holiday stays plain. */

import { dutyDateOf, weekdayOfDutyDate } from "./chicago-time.js";

export const THEME_IDS = [
  "new-year",
  "mlk",
  "valentines",
  "presidents",
  "st-patricks",
  "easter",
  "memorial-day",
  "juneteenth",
  "july-4",
  "labor-day",
  "peoples-day",
  "halloween",
  "veterans",
  "thanksgiving",
  "christmas"
];

const FIXED_DAY = {
  "new-year": [1, 1],
  valentines: [2, 14],
  "st-patricks": [3, 17],
  juneteenth: [6, 19],
  "july-4": [7, 4],
  halloween: [10, 31],
  veterans: [11, 11],
  christmas: [12, 25]
};

function pad(n) {
  return String(n).padStart(2, "0");
}

function iso(year, month, day) {
  return year + "-" + pad(month) + "-" + pad(day);
}

function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function nthWeekday(year, month, name, n) {
  let count = 0;
  for (let day = 1; day <= lastDayOfMonth(year, month); day += 1) {
    if (weekdayOfDutyDate(iso(year, month, day)) !== name) continue;
    count += 1;
    if (count === n) return iso(year, month, day);
  }
  return "";
}

function lastWeekday(year, month, name) {
  let found = "";
  for (let day = 1; day <= lastDayOfMonth(year, month); day += 1) {
    const duty = iso(year, month, day);
    if (weekdayOfDutyDate(duty) === name) found = duty;
  }
  return found;
}

/** Gregorian Easter Sunday, Anonymous algorithm. */
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

export function holidayDate(id, year) {
  if (FIXED_DAY[id]) return iso(year, FIXED_DAY[id][0], FIXED_DAY[id][1]);
  if (id === "mlk") return nthWeekday(year, 1, "Mon", 3);
  if (id === "presidents") return nthWeekday(year, 2, "Mon", 3);
  if (id === "memorial-day") return lastWeekday(year, 5, "Mon");
  if (id === "labor-day") return nthWeekday(year, 9, "Mon", 1);
  if (id === "peoples-day") return nthWeekday(year, 10, "Mon", 2);
  if (id === "thanksgiving") return nthWeekday(year, 11, "Thu", 4);
  if (id === "easter") {
    const easter = easterSunday(year);
    return iso(easter.year, easter.month, easter.day);
  }
  return "";
}

function holidaysInMonth(year, month) {
  return THEME_IDS.map((id) => {
    const duty = holidayDate(id, year);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(duty);
    if (!match || Number(match[2]) !== month) return null;
    return { id, day: Number(match[3]) };
  }).filter(Boolean).sort((a, b) => a.day - b.day);
}

/** First day owned by the later holiday. The earlier holiday stops the day before. */
function laterStartDay(earlierDay, laterDay) {
  return Math.ceil((earlierDay + laterDay) / 2);
}

export function monthWindows(year, month) {
  const holidays = holidaysInMonth(year, month);
  if (!holidays.length) return [];
  const last = lastDayOfMonth(year, month);
  return holidays.map((holiday, index) => {
    const startDay = index === 0 ? 1 : laterStartDay(holidays[index - 1].day, holiday.day);
    const endDay = index === holidays.length - 1 ? last : laterStartDay(holiday.day, holidays[index + 1].day) - 1;
    return {
      theme: holiday.id,
      startDay,
      endDay,
      start: iso(year, month, startDay),
      end: iso(year, month, endDay)
    };
  });
}

export function themeForDutyDate(dutyDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dutyDate || "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const windows = monthWindows(year, month);
  for (let i = 0; i < windows.length; i += 1) {
    if (day >= windows[i].startDay && day <= windows[i].endDay) return windows[i].theme;
  }
  return null;
}

export function resolveTheme(date, override) {
  const raw = String(override == null ? "" : override).trim().toLowerCase();
  if (raw === "off") return null;
  if (raw && raw !== "auto" && THEME_IDS.includes(raw)) return raw;
  const duty = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date
    : dutyDateOf(date || new Date());
  return themeForDutyDate(duty);
}

function svg(body) {
  return '<svg class="holiday-svg" viewBox="0 0 1600 525" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' + body + "</svg>";
}

const sky = "translate(980 4) scale(0.72)";
const DECOR = {
  "new-year": svg('<g transform="' + sky + '" fill="#1F3864"><circle cx="20" cy="16" r="4"/><circle cx="70" cy="8" r="3"/><circle cx="120" cy="18" r="4"/><circle cx="168" cy="8" r="3"/><path fill="none" stroke="#FFC20E" stroke-width="3" d="M10 34 h170"/></g>'),
  mlk: svg('<g transform="' + sky + '"><path fill="#FFC20E" d="M70 2 a16 16 0 0 1 16 16 v4 H54 v-4 a16 16 0 0 1 16 -16 z"/><rect x="66" y="22" width="8" height="10" fill="#1F3864"/><rect x="56" y="32" width="28" height="4" rx="2" fill="#1F3864"/></g>'),
  valentines: svg('<g transform="' + sky + '" fill="#c23b56"><path transform="translate(70 22) scale(.7)" d="M0 6 C0 -8 16 -10 16 2 C16 14 0 22 0 22 C0 22 -16 14 -16 2 C-16 -10 0 -8 0 6 Z"/><path transform="translate(130 26) scale(.45)" d="M0 6 C0 -8 16 -10 16 2 C16 14 0 22 0 22 C0 22 -16 14 -16 2 C-16 -10 0 -8 0 6 Z"/></g>'),
  presidents: svg('<g transform="' + sky + '" fill="#1F3864"><polygon points="40,4 46,18 62,18 49,27 54,42 40,33 26,42 31,27 18,18 34,18"/><polygon points="120,8 125,20 138,20 128,27 132,40 120,33 108,40 112,27 102,20 115,20"/></g>'),
  "st-patricks": svg('<g transform="' + sky + ' translate(70 28)" fill="#1f7a3a"><path transform="scale(.55)" d="M0 0 C18 -8 26 -28 8 -32 C-4 -22 0 -8 0 0 C-18 -8 -32 -4 -34 10 C-18 12 -6 4 0 0 C-10 18 -6 34 10 36 C12 18 4 8 0 0 C16 12 34 8 36 -6 C20 -10 8 -4 0 0 Z"/><rect x="-1" y="2" width="3" height="16" rx="1"/></g>'),
  easter: svg('<g transform="' + sky + '"><ellipse cx="50" cy="20" rx="9" ry="12" fill="#f4d35e" stroke="#1F3864" stroke-width="1.5"/><ellipse cx="84" cy="22" rx="8" ry="11" fill="#f7f3ea" stroke="#2F5597" stroke-width="1.5"/><ellipse cx="116" cy="18" rx="9" ry="12" fill="#d7ecf5" stroke="#1F3864" stroke-width="1.5"/></g>'),
  "memorial-day": svg('<g transform="' + sky + ' translate(70 6)"><rect width="36" height="22" fill="#1F3864"/><rect y="7" width="36" height="8" fill="#f7f3ea"/><rect y="15" width="36" height="7" fill="#b23a3a"/><rect x="14" width="8" height="22" fill="#f7f3ea"/></g>'),
  juneteenth: svg('<g transform="' + sky + ' translate(60 2)"><path fill="#bb3a2f" d="M8 28 a28 28 0 0 1 56 0 z"/><polygon fill="#e0b33a" points="36,2 40,14 54,14 43,22 47,34 36,27 25,34 29,22 18,14 32,14"/></g>'),
  "july-4": svg('<g transform="' + sky + '" fill="#1F3864"><polygon points="48,6 53,18 66,18 56,26 60,38 48,31 36,38 40,26 30,18 43,18"/><polygon points="118,10 122,20 134,20 125,26 128,36 118,30 108,36 111,26 102,20 114,20"/><polygon points="84,2 87,10 96,10 89,15 92,24 84,19 76,24 79,15 72,10 81,10"/></g>'),
  "labor-day": svg('<g transform="' + sky + ' translate(40 4)"><path fill="#1F3864" d="M12 4 h70 a10 10 0 0 1 10 10 v4 H2 v-4 a10 10 0 0 1 10 -10 z"/><rect x="8" y="18" width="78" height="6" rx="2" fill="#FFC20E"/><rect x="40" y="24" width="14" height="12" fill="#1F3864"/></g>'),
  "peoples-day": svg('<g transform="' + sky + ' translate(70 4)"><circle cx="28" cy="16" r="12" fill="none" stroke="#c4652a" stroke-width="3"/><circle cx="28" cy="16" r="4" fill="#d4a017"/><path fill="none" stroke="#6b3a12" stroke-width="2" d="M8 36 h40"/></g>'),
  halloween: svg('<g transform="' + sky + ' translate(78 2)"><circle cx="16" cy="16" r="14" fill="#e07a1f"/><path fill="#1d2330" d="M8 14 l5 5 l5 -5 l3 6 h-16 z M20 14 l5 5 l5 -5 l3 6 h-16 z M12 24 h10 l-5 5 z"/></g>'),
  veterans: svg('<g transform="' + sky + ' translate(84 2)"><circle cx="14" cy="12" r="10" fill="#b23a3a"/><circle cx="14" cy="12" r="4" fill="#1d2330"/><rect x="12" y="20" width="3" height="14" fill="#1f7a3a"/></g>'),
  thanksgiving: svg('<g transform="' + sky + '" fill="#c4652a"><path transform="translate(40 28) scale(.55) rotate(-18)" d="M0 0 C16 -26 34 -8 26 14 C20 28 6 26 0 16 C-8 26 -22 28 -26 12 C-32 -8 -16 -26 0 0 Z"/><path transform="translate(90 30) scale(.55) rotate(12)" fill="#8c3b16" d="M0 0 C16 -26 34 -8 26 14 C20 28 6 26 0 16 C-8 26 -22 28 -26 12 C-32 -8 -16 -26 0 0 Z"/><path transform="translate(140 26) scale(.55) rotate(-6)" fill="#d4a017" d="M0 0 C16 -26 34 -8 26 14 C20 28 6 26 0 16 C-8 26 -22 28 -26 12 C-32 -8 -16 -26 0 0 Z"/></g>'),
  christmas: svg('<g transform="' + sky + '"><path d="M16 14 h160" fill="none" stroke="#1f7a3a" stroke-width="2"/><circle class="bulb" cx="28" cy="14" r="4" fill="#b23a3a"/><circle class="bulb" cx="64" cy="14" r="4" fill="#FFC20E"/><circle class="bulb" cx="100" cy="14" r="4" fill="#1F3864"/><circle class="bulb" cx="136" cy="14" r="4" fill="#b23a3a"/><circle class="bulb" cx="168" cy="14" r="4" fill="#FFC20E"/><circle cx="100" cy="32" r="10" fill="none" stroke="#1f7a3a" stroke-width="3"/><circle cx="100" cy="32" r="3" fill="#b23a3a"/></g>')
};

export function themeDecor(themeId) {
  return DECOR[themeId] || "";
}
