/** Holiday marks for the logo. Dates are America/Chicago calendar days.
 * The logo file itself is never changed. A month is split at the midpoint
 * between consecutive holidays. A month with no holiday stays plain. */

import { dutyDateOf, weekdayOfDutyDate } from "./chicago-time.js";

export const THEME_IDS = [
  "new-year",
  "mlk",
  "groundhog",
  "valentines",
  "presidents",
  "st-patricks",
  "easter",
  "arbor-day",
  "earth-day",
  "mothers-day",
  "memorial-day",
  "fathers-day",
  "juneteenth",
  "july-4",
  "labor-day",
  "peoples-day",
  "halloween",
  "veterans",
  "thanksgiving",
  "christmas"
];

export const THEME_LABELS = {
  "new-year": "New Year",
  mlk: "Martin Luther King Jr. Day",
  groundhog: "Groundhog Day",
  valentines: "Valentine's Day",
  presidents: "Presidents' Day",
  "st-patricks": "St. Patrick's Day",
  easter: "Easter",
  "arbor-day": "Arbor Day",
  "earth-day": "Earth Day",
  "mothers-day": "Mother's Day",
  "memorial-day": "Memorial Day",
  "fathers-day": "Father's Day",
  juneteenth: "Juneteenth",
  "july-4": "Fourth of July",
  "labor-day": "Labor Day",
  "peoples-day": "Indigenous Peoples' Day",
  halloween: "Halloween",
  veterans: "Veterans Day",
  thanksgiving: "Thanksgiving",
  christmas: "Christmas"
};

const FIXED_DAY = {
  "new-year": [1, 1],
  groundhog: [2, 2],
  valentines: [2, 14],
  "st-patricks": [3, 17],
  "earth-day": [4, 22],
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
  if (id === "mothers-day") return nthWeekday(year, 5, "Sun", 2);
  if (id === "fathers-day") return nthWeekday(year, 6, "Sun", 3);
  if (id === "arbor-day") return lastWeekday(year, 4, "Fri");
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

const GREETING = {
  "new-year": "Happy New Year",
  mlk: "Martin Luther King Jr. Day",
  groundhog: "Happy Groundhog Day",
  valentines: "Happy Valentine's Day",
  presidents: "Happy Presidents' Day",
  "st-patricks": "Happy St. Patrick's Day",
  easter: "Happy Easter",
  "arbor-day": "Happy Arbor Day",
  "earth-day": "Happy Earth Day",
  "mothers-day": "Happy Mother's Day",
  "memorial-day": "Memorial Day",
  "fathers-day": "Happy Father's Day",
  juneteenth: "Happy Juneteenth",
  "july-4": "Happy Independence Day",
  "labor-day": "Happy Labor Day",
  "peoples-day": "Indigenous Peoples' Day",
  halloween: "Happy Halloween",
  veterans: "Happy Veterans Day",
  thanksgiving: "Happy Thanksgiving",
  christmas: "Merry Christmas"
};

const TINT = {
  "new-year": "#efe6c4",
  mlk: "#efe6c4",
  groundhog: "#efe2cf",
  valentines: "#f8d5df",
  presidents: "#e4eef8",
  "st-patricks": "#d7f0dc",
  easter: "#f7e6f4",
  "arbor-day": "#e3f2e6",
  "earth-day": "#d7f0dc",
  "mothers-day": "#f7e6f4",
  "memorial-day": "#f6e4e4",
  "fathers-day": "#e4eef8",
  juneteenth: "#f8e6d2",
  "july-4": "#e4eef8",
  "labor-day": "#e4eef8",
  "peoples-day": "#f3e6d4",
  halloween: "#f6d3b0",
  veterans: "#d9e6f5",
  thanksgiving: "#f6e2c4",
  christmas: "#e3f2e6"
};

function bannerSvg(body) {
  return '<svg class="holiday-svg" viewBox="0 0 1200 72" preserveAspectRatio="none" aria-hidden="true">' + body + "</svg>";
}

function sceneSvg(body) {
  return '<svg class="holiday-svg" viewBox="0 0 1600 525" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' + body + "</svg>";
}

function scallops(colors) {
  let out = "";
  for (let i = 0; i < 16; i += 1) {
    const x = i * 75;
    out += '<g class="wave" style="animation-delay:' + (i * 0.12) + 's"><polygon points="' + x + ",0 " + (x + 75) + ",0 " + (x + 37) + ',68" fill="' + colors[i % colors.length] + '"/></g>';
  }
  return out;
}

const PATRIOTIC = ["#b4232a", "#f7f7fb", "#1F3864"];

function flag(x, y, w, h) {
  const slices = 9;
  const sliceWidth = w / slices;
  const stripe = h / 13;
  const cantonW = w * 0.42;
  const cantonH = stripe * 7;
  const stars = [
    [w * 0.1, stripe * 1.7, stripe * 0.62],
    [w * 0.26, stripe * 1.7, stripe * 0.55],
    [w * 0.18, stripe * 3.4, stripe * 0.62],
    [w * 0.1, stripe * 5.1, stripe * 0.55],
    [w * 0.26, stripe * 5.1, stripe * 0.55]
  ];
  let out = '<g transform="translate(' + x + " " + y + ')">';
  for (let slice = 0; slice < slices; slice += 1) {
    const sx = slice * sliceWidth;
    out += '<g class="ripple" style="animation-delay:' + (slice * 0.1) + 's">';
    for (let row = 0; row < 13; row += 1) {
      out += '<rect x="' + sx + '" y="' + (row * stripe) + '" width="' + (sliceWidth + 1) + '" height="' + (stripe + 0.5) + '" fill="' + (row % 2 ? "#f7f7fb" : "#b4232a") + '"/>';
    }
    if (sx < cantonW) {
      out += '<rect x="' + sx + '" y="0" width="' + Math.min(sliceWidth + 1, cantonW - sx) + '" height="' + cantonH + '" fill="#1F3864"/>';
    }
    stars.forEach(function (dot) {
      if (dot[0] >= sx && dot[0] < sx + sliceWidth) {
        out += '<circle cx="' + dot[0] + '" cy="' + dot[1] + '" r="' + dot[2] + '" fill="#fff"/>';
      }
    });
    out += "</g>";
  }
  out += "</g>";
  return out;
}

function heart(x, y, s, color, delay) {
  return '<g transform="translate(' + x + " " + y + ") scale(" + s + ')"><g class="float-up" style="animation-delay:' + (delay || 0) + 's"><path fill="' + color + '" d="M0 18 C0 -8 28 -12 28 10 C28 32 0 48 0 48 C0 48 -28 32 -28 10 C-28 -12 0 -8 0 18 Z"/></g></g>';
}

function shamrock(x, y, s, delay) {
  return '<g transform="translate(' + x + " " + y + ") scale(" + s + ')"><g class="drift" style="animation-delay:' + (delay || 0) + 's" fill="#1f7a3a"><path d="M0 0 C22 -8 30 -36 8 -40 C-6 -26 0 -8 0 0 C-22 -8 -40 -6 -42 12 C-22 16 -8 6 0 0 C-12 22 -8 42 12 44 C16 22 6 10 0 0 C20 14 42 10 44 -8 C24 -12 10 -4 0 0 Z"/><rect x="-3" y="6" width="6" height="28" rx="3"/></g></g>';
}

function egg(x, y, fill, delay) {
  return '<ellipse class="bob" style="animation-delay:' + (delay || 0) + 's" cx="' + x + '" cy="' + y + '" rx="46" ry="62" fill="' + fill + '" stroke="#1F3864" stroke-width="4"/>';
}

function pumpkin(x, y, s, glow) {
  return '<g transform="translate(' + x + " " + y + ") scale(" + s + ')"><ellipse cx="0" cy="8" rx="34" ry="28" fill="#e07a1f"/><ellipse cx="-16" cy="8" rx="16" ry="26" fill="#c4652a"/><ellipse cx="16" cy="8" rx="16" ry="26" fill="#f4a259"/>' +
    (glow ? '<ellipse class="glow" cx="0" cy="8" rx="12" ry="10" fill="#ffe08a"/>' : "") +
    '<rect x="-4" y="-28" width="8" height="16" rx="2" fill="#2f6b32"/></g>';
}

function leaf(x, y, color, rot, drift) {
  const body = '<path fill="' + color + '" d="M0 0 C28 -48 62 -16 46 24 C34 52 8 46 0 28 C-12 48 -40 50 -48 22 C-58 -16 -28 -48 0 0 Z"/>';
  return '<g transform="translate(' + x + " " + y + ") rotate(" + rot + ')">' +
    (drift != null ? '<g class="drift" style="animation-delay:' + drift + 's">' + body + "</g>" : body) + "</g>";
}

function star(x, y, r, color, delay) {
  return '<polygon class="twinkle" style="animation-delay:' + (delay || 0) + 's" fill="' + color + '" points="' + [
    [x, y - r],
    [x + r * 0.28, y - r * 0.32],
    [x + r, y - r * 0.28],
    [x + r * 0.42, y + r * 0.12],
    [x + r * 0.62, y + r],
    [x, y + r * 0.42],
    [x - r * 0.62, y + r],
    [x - r * 0.42, y + r * 0.12],
    [x - r, y - r * 0.28],
    [x - r * 0.28, y - r * 0.32]
  ].map((pair) => pair.join(",")).join(" ") + '"/>';
}

function firework(x, y, delay) {
  const colors = ["#FFC20E", "#f7f7fb", "#7eb6ff", "#ff6b6b", "#ffd0a8", "#fff4c2"];
  let sparks = "";
  const count = 18;
  for (let i = 0; i < count; i += 1) {
    const angle = Math.round((i / count) * 360);
    const radius = 78 + (i % 3) * 36;
    sparks += '<g transform="rotate(' + angle + ') translate(0,' + (-radius) + ')">' +
      '<circle r="' + (14 + (i % 2) * 6) + '" fill="' + colors[i % colors.length] + '"/></g>';
  }
  return '<g transform="translate(' + x + " " + y + ')">' +
    '<rect class="fuse" style="animation-delay:' + delay + 's" x="-3" y="0" width="6" height="120" rx="3" fill="#ffe27a"/>' +
    '<g class="spark" style="animation-delay:' + delay + 's">' + sparks + '<circle r="16" fill="#fff"/></g></g>';
}

function walkingTurkey() {
  const feather = function (rot, fill) {
    return '<ellipse rx="46" ry="16" fill="' + fill + '" transform="rotate(' + rot + ') translate(36,0)"/>';
  };
  return '<g transform="translate(0 455)"><g class="turkey-walk"><g class="turkey-bob">' +
    '<g class="turkey-tail">' +
    feather(-70, "#6b2a12") + feather(-46, "#8c3b16") + feather(-22, "#c4652a") +
    feather(0, "#d4a017") + feather(22, "#c4652a") + feather(46, "#8c3b16") + feather(70, "#6b2a12") +
    "</g>" +
    '<ellipse cx="18" cy="4" rx="32" ry="20" fill="#6b3a12"/>' +
    '<g class="turkey-head"><circle cx="48" cy="-8" r="11" fill="#5c2e0a"/>' +
    '<path fill="#e07a1f" d="M56 -12 L74 -6 L56 -1 Z"/>' +
    '<path fill="#b4232a" d="M42 -18 C46 -32 56 -26 48 -14 Z"/>' +
    '<circle cx="52" cy="-10" r="1.8" fill="#1d2330"/></g>' +
    '<g class="leg"><path d="M10 20 L2 42 M2 42 L-8 48 M2 42 L6 50 M2 42 L12 46" fill="none" stroke="#e07a1f" stroke-width="3.5" stroke-linecap="round"/></g>' +
    '<g class="leg leg-b"><path d="M24 20 L30 42 M30 42 L22 48 M30 42 L34 50 M30 42 L40 46" fill="none" stroke="#e07a1f" stroke-width="3.5" stroke-linecap="round"/></g>' +
    "</g></g></g>";
}

function nameBanner(label, fill, ink) {
  return bannerSvg('<rect width="1200" height="72" fill="' + fill + '"/><text class="banner-shimmer" x="600" y="48" text-anchor="middle" font-family="Georgia, serif" font-size="40" font-weight="700" fill="' + ink + '">' + label + "</text>");
}

function lights() {
  const colors = ["#b4232a", "#1f7a3a", "#FFC20E", "#2F5597"];
  let bulbs = '<path d="M16 30 H1184" fill="none" stroke="#1f7a3a" stroke-width="6"/>';
  for (let i = 0; i < 12; i += 1) {
    const cx = 48 + i * 96;
    bulbs += '<circle cx="' + cx + '" cy="30" r="15" fill="' + colors[i % colors.length] + '"/>';
    for (let c = 0; c < colors.length; c += 1) {
      const delay = (i * 0.2 + c * 0.55).toFixed(2);
      bulbs += '<circle class="bulb-color" style="animation-delay:' + delay + 's" cx="' + cx + '" cy="30" r="15" fill="' + colors[c] + '"/>';
    }
  }
  return bannerSvg(bulbs);
}

function wreath() {
  return '<g transform="translate(1264 86)"><line x1="0" y1="-70" x2="0" y2="-40" stroke="#6b3a12" stroke-width="3"/>' +
    '<g class="wreath"><circle r="34" fill="none" stroke="#1f7a3a" stroke-width="14"/>' +
    '<circle r="26" fill="none" stroke="#2f8a48" stroke-width="5"/>' +
    '<circle cx="-18" cy="6" r="5" fill="#b4232a"/><circle cx="16" cy="-8" r="5" fill="#b4232a"/><circle cx="4" cy="18" r="4" fill="#FFC20E"/>' +
    '<path fill="#b4232a" d="M-14 26 C-30 14 -38 36 -16 40 C-6 32 0 36 0 26 C0 36 6 32 16 40 C38 36 30 14 14 26 C6 20 0 24 0 26 C0 24 -6 20 -14 26 Z"/>' +
    '<rect x="-4" y="26" width="8" height="20" rx="2" fill="#b4232a"/></g></g>';
}

function christmasTree(x, y) {
  return '<g transform="translate(' + x + " " + y + ')">' +
    '<polygon points="0,-62 26,-18 -26,-18" fill="#1f7a3a"/>' +
    '<polygon points="0,-34 34,8 -34,8" fill="#18703a"/>' +
    '<polygon points="0,-6 40,36 -40,36" fill="#145c30"/>' +
    '<rect x="-7" y="36" width="14" height="14" fill="#6b3a12"/>' +
    '<circle cx="0" cy="-50" r="5" fill="#FFC20E"/>' +
    '<circle cx="-12" cy="2" r="4" fill="#b4232a"/>' +
    '<circle cx="14" cy="18" r="4" fill="#f7f7fb"/>' +
    "</g>";
}

function fadeBanner(label, fill, ink) {
  return bannerSvg('<rect width="1200" height="72" fill="' + fill + '"/><text class="fade-in" x="600" y="48" text-anchor="middle" font-family="Georgia, serif" font-size="40" font-weight="700" fill="' + ink + '">' + label + "</text>");
}

function lightBulbs(colors, count, x0, y, gap) {
  let out = "";
  for (let i = 0; i < count; i += 1) {
    const cx = x0 + i * gap;
    out += '<circle cx="' + cx + '" cy="' + y + '" r="5" fill="' + colors[i % colors.length] + '"/>';
    for (let c = 0; c < colors.length; c += 1) {
      const delay = (i * 0.18 + c * 0.55).toFixed(2);
      out += '<circle class="bulb-color" style="animation-delay:' + delay + 's" cx="' + cx + '" cy="' + y + '" r="5" fill="' + colors[c] + '"/>';
    }
  }
  return out;
}

export function themeRing(themeId) {
  const colors = themeId === "christmas"
    ? ["#b4232a", "#1f7a3a", "#FFC20E", "#2F5597"]
    : (themeId === "halloween" ? ["#e07a1f", "#6b3a9a", "#f4a259", "#2a1848"] : null);
  if (!colors) return "";
  return '<svg class="holiday-svg light-ring-svg" viewBox="0 0 400 140" preserveAspectRatio="none" aria-hidden="true">' +
    lightBulbs(colors, 11, 20, 6, 36) + lightBulbs(colors, 11, 20, 134, 36) +
    lightBulbs(colors, 1, 4, 40, 0) + lightBulbs(colors, 1, 4, 70, 0) + lightBulbs(colors, 1, 4, 100, 0) +
    lightBulbs(colors, 1, 396, 40, 0) + lightBulbs(colors, 1, 396, 70, 0) + lightBulbs(colors, 1, 396, 100, 0) +
    "</svg>";
}

const BANNERS = {
  "new-year": bannerSvg('<rect width="1200" height="72" fill="#1F3864"/>' + star(180, 36, 14, "#FFC20E", 0) + star(600, 36, 16, "#f7f7fb", 0.6) + star(1020, 36, 14, "#FFC20E", 1.2)),
  mlk: nameBanner("Martin Luther King Jr. Day", "#1F3864", "#FFC20E"),
  valentines: bannerSvg(scallops(["#c23b56", "#f7f7fb", "#e89aaf"])),
  presidents: bannerSvg(scallops(PATRIOTIC)),
  "st-patricks": bannerSvg(scallops(["#1f7a3a", "#f7f7fb", "#8fd19a"])),
  easter: bannerSvg(scallops(["#f4d35e", "#f7f7fb", "#9fd3ea", "#f2b6d0"])),
  "memorial-day": bannerSvg(scallops(PATRIOTIC)),
  "mothers-day": fadeBanner("Happy Mother's Day", "#f4c7d8", "#6b243c"),
  "fathers-day": fadeBanner("Happy Father's Day", "#1F3864", "#f6f3ec"),
  "arbor-day": fadeBanner("Happy Arbor Day", "#1f7a3a", "#f6f3ec"),
  "earth-day": fadeBanner("Happy Earth Day", "#145c30", "#f6f3ec"),
  groundhog: bannerSvg('<rect width="1200" height="72" fill="#6b4a2a"/>'),
  juneteenth: bannerSvg(scallops(["#bb3a2f", "#f7f7fb", "#e0b33a", "#1F3864"])),
  "july-4": bannerSvg(scallops(PATRIOTIC) + star(80, 28, 16, "#FFC20E") + star(600, 26, 18, "#FFC20E") + star(1080, 28, 16, "#FFC20E")),
  "labor-day": nameBanner("Labor Day", "#1F3864", "#FFC20E"),
  "peoples-day": nameBanner("Indigenous Peoples' Day", "#6b3a12", "#f6f3ec"),
  halloween: bannerSvg(scallops(["#e07a1f", "#1d2330", "#f4a259"])),
  veterans: bannerSvg(scallops(PATRIOTIC)),
  thanksgiving: bannerSvg(scallops(["#c4652a", "#8c3b16", "#d4a017", "#f6e2c4"])),
  christmas: lights()
};

const SCENES = {
  "new-year": sceneSvg(firework(1140, 78, 0) + firework(1288, 36, 1.6) + firework(1420, 96, 3.2)),
  mlk: sceneSvg(""),
  valentines: sceneSvg(heart(1040, 16, 1.8, "#c23b56", 0) + heart(1240, 55, 1.2, "#e89aaf", 1.4)),
  presidents: sceneSvg(flag(1000, 10, 220, 130) + star(1260, 36, 26, "#FFC20E", 0.4)),
  easter: sceneSvg(
    '<g transform="translate(180 470)"><ellipse class="egg-bit" cx="0" cy="0" rx="16" ry="22" fill="#f4d35e" stroke="#1F3864" stroke-width="2"/></g>' +
    '<g transform="translate(420 478)"><ellipse class="egg-bit" style="animation-delay:3s" cx="0" cy="0" rx="16" ry="22" fill="#9fd3ea" stroke="#1F3864" stroke-width="2"/></g>' +
    '<g transform="translate(700 468)"><ellipse class="egg-bit" style="animation-delay:6s" cx="0" cy="0" rx="16" ry="22" fill="#f2b6d0" stroke="#1F3864" stroke-width="2"/></g>' +
    '<g class="hopper" transform="translate(10 390) scale(2.4)">' +
    '<ellipse cx="16" cy="28" rx="18" ry="8" fill="#d7ecf5"/>' +
    '<ellipse cx="28" cy="8" rx="22" ry="16" fill="#f7f7fb"/>' +
    '<ellipse cx="12" cy="-18" rx="6" ry="16" fill="#f7f7fb"/><ellipse cx="26" cy="-18" rx="6" ry="16" fill="#f7f7fb"/>' +
    '<circle cx="46" cy="2" r="10" fill="#f7f7fb"/><circle cx="49" cy="0" r="1.5" fill="#1d2330"/>' +
    '<path d="M58 6 L70 2 L58 12 Z" fill="#f2b6d0"/>' +
    "</g>"
  ),
  "st-patricks": sceneSvg(
    shamrock(80, 70, 1.1, 0) + shamrock(1480, 80, 1.15, 1) + shamrock(80, 360, 0.9, 0.6) + shamrock(1500, 360, 1, 1.4) +
    '<g transform="translate(200 470)"><ellipse class="coin" cx="0" cy="0" rx="12" ry="8" fill="#FFC20E"/></g>' +
    '<g transform="translate(480 478)"><ellipse class="coin" style="animation-delay:3.5s" cx="0" cy="0" rx="12" ry="8" fill="#e0b33a"/></g>' +
    '<g transform="translate(760 466)"><ellipse class="coin" style="animation-delay:7s" cx="0" cy="0" rx="12" ry="8" fill="#FFC20E"/></g>' +
    '<g class="picker" transform="translate(60 400)">' +
    '<ellipse cx="70" cy="48" rx="26" ry="12" fill="#1d2330"/>' +
    '<ellipse cx="70" cy="40" rx="16" ry="8" fill="#FFC20E"/>' +
    '<rect x="8" y="10" width="22" height="36" fill="#1f7a3a"/><circle cx="18" cy="2" r="10" fill="#f0d2b0"/>' +
    '<path d="M6 -8 H32 L28 2 H8 Z" fill="#1f7a3a"/><rect x="16" y="-16" width="4" height="10" fill="#1f7a3a"/>' +
    '<path d="M10 12 H28 V22 H10 Z" fill="#e8e0d0"/>' +
    "</g>"
  ),
  groundhog: sceneSvg(
    '<g transform="translate(150 390) scale(2.3)"><ellipse cx="0" cy="28" rx="58" ry="20" fill="#6b4a2a"/>' +
    '<g class="groundhog"><ellipse cx="0" cy="10" rx="26" ry="18" fill="#8a6a42"/><circle cy="-8" r="14" fill="#a07848"/>' +
    '<circle cx="-6" cy="-10" r="2" fill="#1d2330"/><circle cx="6" cy="-10" r="2" fill="#1d2330"/><ellipse cy="-2" rx="4" ry="3" fill="#5c3a22"/></g></g>'
  ),
  "arbor-day": sceneSvg(
    '<g transform="translate(260 450)"><ellipse cy="16" rx="22" ry="8" fill="#6b4a2a"/><circle cy="8" r="7" fill="#c4a574"/>' +
    '<g class="sprout"><rect x="-3" y="-70" width="6" height="80" fill="#2f6b32"/>' +
    '<ellipse cx="-16" cy="-40" rx="16" ry="8" fill="#1f7a3a"/><ellipse cx="16" cy="-28" rx="16" ry="8" fill="#18703a"/></g></g>'
  ),
  "earth-day": sceneSvg(
    christmasTree(360, 400) + christmasTree(560, 420) +
    '<text x="900" y="120" font-family="Georgia, serif" font-size="42" fill="#145c30">Happy Earth Day</text>'
  ),
  "mothers-day": sceneSvg(""),
  "fathers-day": sceneSvg(""),
  "memorial-day": sceneSvg(flag(1000, 16, 240, 140)),
  juneteenth: sceneSvg(star(1120, 90, 64, "#e0b33a") + '<path fill="#bb3a2f" d="M980 150 a150 64 0 0 1 300 0 z"/>'),
  "july-4": sceneSvg(flag(760, 20, 200, 110) + firework(1240, 70, 0.4) + firework(1420, 110, 2.2)),
  "labor-day": sceneSvg(
    '<g transform="translate(1020 40) scale(1.45)">' +
    '<rect x="150" y="20" width="18" height="250" fill="#c4a574"/>' +
    '<path d="M40 70 H168" stroke="#FFC20E" stroke-width="5"/>' +
    '<line x1="20" y1="10" x2="20" y2="280" stroke="#8a8f98" stroke-width="5"/>' +
    '<line x1="52" y1="10" x2="52" y2="280" stroke="#8a8f98" stroke-width="5"/>' +
    '<line x1="20" y1="50" x2="52" y2="50" stroke="#8a8f98" stroke-width="4"/>' +
    '<line x1="20" y1="100" x2="52" y2="100" stroke="#8a8f98" stroke-width="4"/>' +
    '<line x1="20" y1="150" x2="52" y2="150" stroke="#8a8f98" stroke-width="4"/>' +
    '<g transform="translate(36 90)"><rect x="-12" y="-40" width="28" height="8" rx="2" fill="#FFC20E"/>' +
    '<circle cy="-24" r="11" fill="#f0d2b0"/><rect x="-9" y="-16" width="18" height="40" fill="#1F3864"/>' +
    '<g class="hammer"><rect x="10" y="-36" width="5" height="30" fill="#6b3a12"/><rect x="4" y="-40" width="18" height="8" fill="#667085"/></g></g>' +
    '<circle class="glow" cx="168" cy="70" r="8" fill="#fff4c2"/></g>'
  ),
  "peoples-day": sceneSvg(""),
  halloween: sceneSvg(
    '<g transform="translate(120 455)"><rect width="36" height="48" fill="#4a5568"/><rect x="10" y="28" width="16" height="20" fill="#2a3140"/></g>' +
    '<g transform="translate(280 468)"><rect width="30" height="36" fill="#5c6778"/><path d="M0 0 L15 -16 L30 0 Z" fill="#5c6778"/></g>' +
    '<g transform="translate(1320 460)"><rect width="40" height="44" fill="#3d4654"/><rect x="12" y="24" width="16" height="20" fill="#232830"/></g>' +
    '<g class="ghost" transform="translate(620 340) scale(1.8)" fill="#f7f7fb" opacity="0.72"><ellipse cx="0" cy="0" rx="22" ry="28"/><path d="M-22 8 L-14 24 L-6 8 L2 24 L10 8 L18 24 L22 8 Z"/><circle cx="-8" cy="-6" r="3" fill="#1d2330"/><circle cx="8" cy="-6" r="3" fill="#1d2330"/></g>' +
    '<g class="ghost" style="animation-delay:3.2s" transform="translate(960 370) scale(1.6)" fill="#f7f7fb" opacity="0.6"><ellipse cx="0" cy="0" rx="18" ry="24"/><circle cx="-6" cy="-4" r="2.5" fill="#1d2330"/><circle cx="6" cy="-4" r="2.5" fill="#1d2330"/></g>' +
    '<g class="ghost" style="animation-delay:6s" transform="translate(1220 320) scale(1.6)" fill="#f7f7fb" opacity="0.66"><ellipse cx="0" cy="0" rx="20" ry="26"/><circle cx="-6" cy="-4" r="2.5" fill="#1d2330"/><circle cx="7" cy="-4" r="2.5" fill="#1d2330"/></g>'
  ),
  veterans: sceneSvg(
    '<rect x="900" y="0" width="420" height="210" fill="#0c1830" opacity="0.72"/>' +
    star(980, 36, 10, "#f7f7fb", 0.2) + star(1120, 70, 8, "#f7f7fb", 0.8) + star(1240, 28, 9, "#f7f7fb", 1.3) +
    flag(980, 48, 220, 120) +
    '<g class="salute" transform="translate(220 430)" fill="#1d2330"><circle cy="-52" r="8"/><path d="M-9 -42 H9 L7 -8 H-7 Z"/><path d="M2 -30 L20 -48" stroke="#1d2330" stroke-width="4"/><path d="M-4 -8 L-6 16 M5 -8 L8 16" stroke="#1d2330" stroke-width="4"/></g>' +
    '<g class="salute" style="animation-delay:.6s" transform="translate(320 438)" fill="#1d2330"><circle cy="-46" r="7"/><path d="M-8 -36 H8 L6 -6 H-6 Z"/><path d="M1 -26 L16 -42" stroke="#1d2330" stroke-width="3.5"/><path d="M-3 -6 L-5 14 M4 -6 L7 14" stroke="#1d2330" stroke-width="3.5"/></g>'
  ),
  thanksgiving: sceneSvg(
    '<g transform="translate(1000 12)"><ellipse cx="70" cy="70" rx="44" ry="32" fill="#8c3b16"/><circle cx="114" cy="54" r="15" fill="#6b3a12"/><path fill="#c4652a" d="M114 42 l10 -14 l8 14 z"/>' +
    leaf(4, 62, "#c4652a", -30) + leaf(-8, 34, "#d4a017", 20) + leaf(24, 18, "#8c3b16", -10) + "</g>" +
    pumpkin(1240, 110, 1.45) + leaf(1460, 70, "#d4a017", 16, 0) + leaf(1180, 24, "#c4652a", -12, 1.5) +
    pumpkin(180, 430, 1.2) + pumpkin(1360, 440, 1.2) + walkingTurkey()
  ),
  christmas: sceneSvg(
    wreath() + christmasTree(1472, 318) +
    '<g class="santa-fly" transform="translate(200 80)">' +
    '<ellipse cx="0" cy="0" rx="16" ry="8" fill="#8c5a2a"/><circle cx="18" cy="-6" r="6" fill="#8c5a2a"/>' +
    '<ellipse cx="70" cy="8" rx="36" ry="12" fill="#b4232a"/><rect x="40" y="-2" width="28" height="10" fill="#f7f7fb"/>' +
    '<circle cx="108" cy="2" r="10" fill="#f0d2b0"/><path fill="#b4232a" d="M96 -8 H120 L114 2 H100 Z"/>' +
    "</g>" +
    '<g transform="translate(70 0)"><path fill="#b4232a" d="M30 78 C24 18 96 -8 132 36 L104 86 Z"/><rect x="8" y="74" width="112" height="22" rx="10" fill="#f7f7fb"/><circle cx="132" cy="34" r="16" fill="#f7f7fb"/></g>' +
    '<g fill="#f7f7fb">' +
    '<g transform="translate(1040 16)"><circle class="snow" r="16"/></g>' +
    '<g transform="translate(1180 36)"><circle class="snow" style="animation-delay:1.1s" r="13"/></g>' +
    '<g transform="translate(1360 12)"><circle class="snow" style="animation-delay:2.2s" r="18"/></g>' +
    '<g transform="translate(1540 24)"><circle class="snow" style="animation-delay:.6s" r="12"/></g>' +
    "</g>"
  )
};

export function themeGreeting(themeId) {
  return GREETING[themeId] || "";
}

export function themeTint(themeId) {
  return TINT[themeId] || "";
}

export function themeBanner(themeId) {
  return BANNERS[themeId] || "";
}

export function themeDecor(themeId) {
  return SCENES[themeId] || "";
}

export function nextPreviewTheme(current) {
  const index = THEME_IDS.indexOf(current);
  return THEME_IDS[(index + 1) % THEME_IDS.length];
}
