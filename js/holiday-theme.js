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
  "columbus",
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
  columbus: "Columbus Day",
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
  if (id === "columbus") return nthWeekday(year, 10, "Mon", 2);
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
  columbus: "Happy Columbus Day",
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
  columbus: "#e7eef6",
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

function art(file, x, y, w, h, cls, delay) {
  const style = delay ? ' style="animation-delay:' + delay + 's"' : "";
  const name = cls ? ' class="' + cls + '"' : "";
  return '<image' + name + style + ' href="holiday/' + file + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>';
}

function bunting() {
  const colors = ["#b4232a", "#f7f7fb", "#1F3864"];
  let out = "";
  for (let i = 0; i < 7; i += 1) {
    out += '<g transform="translate(' + (820 + i * 95) + ' 448)"><g class="wave" style="animation-delay:' + (i * 0.18).toFixed(2) + 's">' +
      '<path d="M0 0 Q24 26 48 0 L48 14 Q24 38 0 14 Z" fill="' + colors[i % 3] + '"/></g></g>';
  }
  return out;
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

function nameBanner(label, fill, ink) {
  return bannerSvg('<rect width="1200" height="72" fill="' + fill + '"/><text class="banner-shimmer" x="600" y="48" text-anchor="middle" font-family="Georgia, serif" font-size="40" font-weight="700" fill="' + ink + '">' + label + "</text>");
}

function roofLights() {
  const colors = ["#d32f2f", "#1b8a3a", "#f2c200", "#2456a6", "#ef6c00"];
  const count = 16;
  const left = 24;
  const right = 1576;
  const span = (right - left) / (count - 1);
  const yTop = 7;
  const drop = 34;
  let wire = "";
  let clips = "";
  let bulbs = "";
  for (let i = 0; i < count; i += 1) {
    const x = left + i * span;
    clips += '<rect x="' + (x - 3).toFixed(1) + '" y="' + (yTop - 3) + '" width="6" height="7" rx="1" fill="#2c241c"/>';
    if (i < count - 1) {
      const x2 = left + (i + 1) * span;
      const mx = (x + x2) / 2;
      wire += (i === 0 ? "M" + x.toFixed(1) + " " + yTop : "") + " Q" + mx.toFixed(1) + " " + (yTop + drop) + " " + x2.toFixed(1) + " " + yTop;
      const hang = yTop + drop / 2;
      const base = colors[i % colors.length];
      let glass = "";
      for (let c = 0; c < colors.length; c += 1) {
        const delay = (i * 0.16 + c * 0.48).toFixed(2);
        glass += '<ellipse class="bulb-color" style="animation-delay:' + delay + 's" cy="14" rx="8" ry="12" fill="' + colors[c] + '"/>';
      }
      bulbs += '<g transform="translate(' + mx.toFixed(1) + " " + hang.toFixed(1) + ')">' +
        '<ellipse cy="18" rx="22" ry="20" fill="' + base + '" opacity="0.16"/>' +
        '<ellipse class="glow" cy="16" rx="14" ry="16" fill="' + base + '" opacity="0.38"/>' +
        '<rect x="-5" y="-2" width="10" height="7" rx="1.2" fill="#4a4036"/>' +
        '<rect x="-3.2" y="-1" width="6.4" height="5" rx="0.8" fill="#d9d3c8"/>' +
        '<path d="M-7 6 C-10 16 -6 26 0 28 C6 26 10 16 7 6 Z" fill="' + base + '"/>' + glass.replace(/cy="14" rx="8" ry="12"/g, 'cy="16" rx="7" ry="11"') +
        '<path d="M-3 9 C-4 14 -2 20 0 22 C1 16 0 11 -1 8 Z" fill="#fff" opacity="0.62"/>' +
        "</g>";
    }
  }
  return '<path d="' + wire + '" fill="none" stroke="#241c16" stroke-width="3" stroke-linecap="round"/>' + clips + bulbs;
}

function wreath() {
  return '<g transform="translate(1264 86)"><line x1="0" y1="-70" x2="0" y2="-40" stroke="#6b3a12" stroke-width="3"/>' +
    '<g class="wreath"><circle r="34" fill="none" stroke="#1f7a3a" stroke-width="14"/>' +
    '<circle r="26" fill="none" stroke="#2f8a48" stroke-width="5"/>' +
    '<circle cx="-18" cy="6" r="5" fill="#b4232a"/><circle cx="16" cy="-8" r="5" fill="#b4232a"/><circle cx="4" cy="18" r="4" fill="#FFC20E"/>' +
    '<path fill="#b4232a" d="M-14 26 C-30 14 -38 36 -16 40 C-6 32 0 36 0 26 C0 36 6 32 16 40 C38 36 30 14 14 26 C6 20 0 24 0 26 C0 24 -6 20 -14 26 Z"/>' +
    '<rect x="-4" y="26" width="8" height="20" rx="2" fill="#b4232a"/></g></g>';
}

function treeLights(x, y, w, h) {
  const spots = [
    [0.5, 0.07, "#ffe27a", 22],
    [0.4, 0.24, "#d32f2f", 8],
    [0.62, 0.26, "#2456a6", 7.5],
    [0.33, 0.36, "#f2c200", 7],
    [0.56, 0.38, "#d32f2f", 8],
    [0.7, 0.42, "#1b8a3a", 7],
    [0.42, 0.48, "#2456a6", 7.5],
    [0.6, 0.52, "#f2c200", 8],
    [0.34, 0.58, "#ef6c00", 7],
    [0.52, 0.62, "#d32f2f", 7.5],
    [0.68, 0.6, "#f2c200", 7]
  ];
  return spots.map(function (spot, i) {
    const cx = (x + spot[0] * w).toFixed(1);
    const cy = (y + spot[1] * h).toFixed(1);
    const delay = (i * 0.17).toFixed(2);
    const bulb = i === 0
      ? '<circle class="glow" r="' + spot[3] + '" fill="' + spot[2] + '" opacity="0.5"/>'
      : '<circle r="' + (spot[3] + 2.6) + '" fill="' + spot[2] + '" opacity="0.22"/>' +
        '<circle class="glow" style="animation-delay:' + delay + 's" r="' + spot[3] + '" fill="' + spot[2] + '"/>' +
        '<circle cx="-1" cy="-1.1" r="1.1" fill="#fff" opacity="0.85"/>';
    return '<g transform="translate(' + cx + " " + cy + ')">' + bulb + "</g>";
  }).join("");
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
  const colors = themeId === "halloween" ? ["#e07a1f", "#6b3a9a", "#f4a259", "#2a1848"] : null;
  if (!colors) return "";
  return '<svg class="holiday-svg light-ring-svg" viewBox="0 0 400 140" preserveAspectRatio="none" aria-hidden="true">' +
    lightBulbs(colors, 11, 20, 6, 36) + lightBulbs(colors, 11, 20, 134, 36) +
    lightBulbs(colors, 1, 4, 40, 0) + lightBulbs(colors, 1, 4, 70, 0) + lightBulbs(colors, 1, 4, 100, 0) +
    lightBulbs(colors, 1, 396, 40, 0) + lightBulbs(colors, 1, 396, 70, 0) + lightBulbs(colors, 1, 396, 100, 0) +
    "</svg>";
}

const BANNERS = {
  "new-year": bannerSvg('<rect width="1200" height="72" fill="#1F3864"/>' + star(180, 36, 14, "#FFC20E", 0) + star(600, 36, 16, "#f7f7fb", 0.6) + star(1020, 36, 14, "#FFC20E", 1.2)),
  mlk: bannerSvg(scallops(["#1F3864", "#FFC20E", "#f7f7fb"])),
  valentines: bannerSvg(scallops(["#c23b56", "#f7f7fb", "#e89aaf"])),
  presidents: bannerSvg(scallops(PATRIOTIC)),
  "st-patricks": bannerSvg(scallops(["#1f7a3a", "#f7f7fb", "#8fd19a"])),
  easter: bannerSvg(scallops(["#f4d35e", "#f7f7fb", "#9fd3ea", "#f2b6d0"])),
  "memorial-day": bannerSvg(scallops(PATRIOTIC)),
  "mothers-day": bannerSvg(scallops(["#f4c7d8", "#f7f7fb", "#c23b56"])),
  "fathers-day": bannerSvg(scallops(["#1F3864", "#f7f7fb", "#2F5597"])),
  "arbor-day": bannerSvg(scallops(["#1f7a3a", "#f7f7fb", "#8fd19a"])),
  "earth-day": bannerSvg(scallops(["#145c30", "#f7f7fb", "#7eb6ff"])),
  groundhog: bannerSvg('<rect width="1200" height="72" fill="#6b4a2a"/>'),
  juneteenth: bannerSvg(scallops(["#1F4E8C", "#f7f7fb", "#b4232a"])),
  "july-4": bannerSvg(scallops(PATRIOTIC) + star(80, 28, 16, "#FFC20E") + star(600, 26, 18, "#FFC20E") + star(1080, 28, 16, "#FFC20E")),
  "labor-day": bannerSvg(scallops(["#1F3864", "#FFC20E", "#f7f7fb"])),
  columbus: bannerSvg(scallops(["#8c3b16", "#e0b33a", "#f6e2c4", "#1F3864"])),
  halloween: bannerSvg(scallops(["#e07a1f", "#1d2330", "#f4a259"])),
  veterans: bannerSvg(scallops(PATRIOTIC)),
  thanksgiving: bannerSvg(scallops(["#c4652a", "#8c3b16", "#d4a017", "#f6e2c4"])),
  christmas: bannerSvg('<rect width="1200" height="72" fill="#145c30"/>')
};

function groundShadow(x, y, rx) {
  return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="6" fill="#1c140c" opacity="0.2"/>';
}

function autumnLeaves(limit) {
  const leaves = [
    ["maple-red.webp", 1088, 4, 168, 214, "leaf-fall", -0.6, 12.4],
    ["maple-orange.webp", 1120, 18, 150, 190, "leaf-fall leaf-b", -4.2, 14.8],
    ["oak-brown.webp", 1288, 8, 150, 200, "leaf-fall leaf-c", -2.4, 11.2],
    ["maple-gold.webp", 1040, 30, 160, 196, "leaf-fall leaf-b", -7.6, 15.6],
    ["maple-burgundy.webp", 1460, 8, 154, 178, "leaf-fall", -3.8, 13.4],
    ["oak-rust.webp", 1188, 28, 140, 180, "leaf-fall leaf-c", -8.2, 12.6],
    ["maple-orange.webp", 1520, 26, 120, 148, "leaf-fall leaf-far", -1.8, 16.2],
    ["maple-red.webp", 1008, 16, 140, 176, "leaf-fall leaf-b", -10.4, 13.8],
    ["maple-gold.webp", 1380, 12, 130, 160, "leaf-fall", -5.5, 14.1],
    ["oak-brown.webp", 1210, 14, 120, 156, "leaf-fall leaf-c leaf-far", -9.1, 11.8],
    ["maple-burgundy.webp", 1188, 6, 136, 166, "leaf-fall leaf-b", -6.7, 15.2],
    ["maple-orange.webp", 1568, 4, 110, 136, "leaf-fall", -12.2, 13.1]
  ];
  return leaves.slice(0, limit || leaves.length).map((leaf) => {
    return '<image class="' + leaf[5] + '" style="animation-delay:' + leaf[6] + "s;animation-duration:" + leaf[7] + 's" href="holiday/leaves/' + leaf[0] + '" x="' + leaf[1] + '" y="' + leaf[2] + '" width="' + leaf[3] + '" height="' + leaf[4] + '"/>';
  }).join("");
}

const SCENES = {
  "new-year": sceneSvg(
    firework(1160, 36, 0) + firework(1340, 18, 1.8) + firework(1500, 64, 3.4) +
    groundShadow(140, 516, 100) +
    art("new-year/party.webp", 8, 300, 300, 218)
  ),
  mlk: sceneSvg(art("mlk/dove.webp", 1040, 8, 320, 296, "bob")),
  valentines: sceneSvg(
    groundShadow(110, 516, 80) +
    art("valentines/roses.webp", 4, 278, 240, 240) +
    art("valentines/heart.webp", 1100, 12, 110, 106, "float-up", 0) +
    art("valentines/heart.webp", 1280, 56, 90, 87, "float-up", 1.2) +
    art("valentines/heart.webp", 1460, 16, 100, 97, "float-up", 0.6)
  ),
  presidents: sceneSvg(
    art("presidents/eagle.webp", 1140, 16, 180, 190, "bob") +
    groundShadow(100, 516, 80) +
    art("presidents/hat.webp", 4, 318, 210, 200)
  ),
  easter: sceneSvg(
    groundShadow(78, 516, 58) + groundShadow(210, 516, 48) +
    art("easter/egg-1.webp", 250, 456, 48, 62, "egg-wobble", 0) +
    art("easter/egg-2.webp", 292, 462, 48, 62, "egg-wobble", 1.2) +
    art("easter/egg-3.webp", 334, 454, 46, 60, "egg-wobble", 2.4) +
    art("easter/egg-4.webp", 372, 460, 44, 56, "egg-wobble", 3.6) +
    art("easter/basket.webp", 168, 370, 160, 144) +
    art("easter/bunny.webp", 0, 308, 200, 210, "hopper")
  ),
  "st-patricks": sceneSvg(
    art("st-patricks/shamrock.webp", 1340, 16, 72, 76, "drift", 0) +
    art("st-patricks/shamrock.webp", 1500, 90, 64, 68, "drift", 1.1) +
    art("st-patricks/shamrock.webp", 1400, 180, 60, 64, "drift", 0.5) +
    groundShadow(80, 516, 70) + groundShadow(230, 516, 50) +
    art("st-patricks/leprechaun.webp", 0, 268, 190, 250) +
    art("st-patricks/pot.webp", 168, 378, 150, 140)
  ),
  groundhog: sceneSvg(
    '<g fill="#c5d0e0">' +
    '<g transform="translate(160 18)"><circle class="snow" r="5"/></g>' +
    '<g transform="translate(480 8)"><circle class="snow" style="animation-delay:1.1s" r="4"/></g>' +
    '<g transform="translate(760 24)"><circle class="snow" style="animation-delay:.5s" r="6"/></g>' +
    '<g transform="translate(1040 10)"><circle class="snow" style="animation-delay:1.7s" r="4"/></g>' +
    "</g>" +
    groundShadow(150, 516, 120) +
    art("groundhog/pop.webp", 6, 308, 270, 210, "groundhog")
  ),
  "arbor-day": sceneSvg(
    groundShadow(155, 516, 62) +
    art("arbor-day/seed.webp", 78, 476, 70, 40, "arbor-stage arbor-seed") +
    art("arbor-day/sprout.webp", 64, 430, 100, 86, "arbor-stage arbor-sprout") +
    art("arbor-day/sapling.webp", 40, 360, 140, 156, "arbor-stage arbor-sapling") +
    art("arbor-day/tree.webp", 0, 268, 174, 250, "arbor-stage arbor-tree") +
    art("arbor-day/vine.webp", 800, 16, 300, 198, "wave")
  ),
  "earth-day": sceneSvg(
    '<g class="earth-globe">' +
    art("earth-day/globe.webp", 1168, 108, 214, 212) +
    art("earth-day/sprout.webp", 1236, 42, 78, 80, "sprout-sway") +
    "</g>" +
    art("earth-day/leaf-1.webp", 1040, 24, 64, 88, "drift", 0) +
    art("earth-day/leaf-2.webp", 1460, 36, 72, 68, "drift", 1.1) +
    art("earth-day/leaf-3.webp", 1120, 140, 60, 64, "drift", 0.6) +
    art("earth-day/leaf-4.webp", 1380, 190, 56, 60, "drift", 1.8) +
    art("earth-day/leaf-5.webp", 1520, 110, 58, 52, "drift", 0.3) +
    art("earth-day/leaf-6.webp", 1008, 80, 66, 62, "drift", 1.4)
  ),
  "mothers-day": sceneSvg(
    groundShadow(160, 516, 100) +
    '<ellipse class="glow" cx="130" cy="455" rx="80" ry="30" fill="#f7b0c4"/>' +
    art("mothers-day/heart.webp", 0, 400, 250, 110, "bloom", 0) +
    art("mothers-day/flower-1.webp", 150, 330, 160, 150, "bloom", 0.6) +
    art("mothers-day/flower-2.webp", 8, 328, 150, 136, "bloom", 1.2) +
    art("mothers-day/flower-4.webp", 190, 348, 155, 134, "bloom", 1.8) +
    art("mothers-day/petal-1.webp", 1040, 24, 36, 42, "drift", 0) +
    art("mothers-day/petal-2.webp", 1220, 48, 34, 32, "drift", 1.2) +
    art("mothers-day/petal-3.webp", 1400, 16, 40, 24, "drift", 0.6) +
    art("mothers-day/petal-4.webp", 1120, 80, 32, 26, "drift", 1.8)
  ),
  "fathers-day": sceneSvg(
    art("fathers-day/tie.webp", 36, 148, 62, 148, "wave") +
    groundShadow(80, 516, 50) + groundShadow(210, 516, 36) +
    art("fathers-day/grill.webp", 0, 278, 220, 240) +
    '<g transform="translate(58 324)"><g class="float-up"><path d="M0 28 C8 16 -6 12 2 0" fill="none" stroke="#c5cad3" stroke-width="4" stroke-linecap="round"/></g></g>' +
    '<g transform="translate(86 312)"><g class="float-up" style="animation-delay:1.1s"><path d="M0 34 C-8 18 8 12 0 -4" fill="none" stroke="#d5dae2" stroke-width="3.5" stroke-linecap="round"/></g></g>' +
    art("fathers-day/toolbox.webp", 190, 390, 145, 128) +
    art("fathers-day/driver.webp", 250, 458, 130, 60)
  ),
  "memorial-day": sceneSvg(
    art("flags/us-flag.webp", 1120, 12, 300, 270, "ripple") +
    groundShadow(100, 516, 70) +
    art("memorial-day/poppies.webp", 6, 276, 220, 242)
  ),
  juneteenth: sceneSvg(art("juneteenth/flag.webp", 1140, 36, 360, 200, "ripple")),
  "july-4": sceneSvg(
    art("flags/us-flag.webp", 1040, 8, 280, 252, "ripple") +
    firework(1340, 48, 0.4) + firework(1500, 90, 2.2) +
    groundShadow(70, 516, 40) +
    art("july-4/sparkler.webp", 6, 250, 124, 268)
  ),
  "labor-day": sceneSvg(
    bunting() +
    art("labor-day/electrician.webp", 960, 148, 168, 328, "labor-work")
  ),
  columbus: sceneSvg(
    autumnLeaves(4) +
    groundShadow(160, 516, 120) +
    art("columbus/ship.webp", 4, 300, 320, 218, "bob")
  ),
  halloween: sceneSvg(
    autumnLeaves(4) +
    groundShadow(140, 516, 110) +
    art("halloween/yard.webp", 4, 300, 280, 218) +
    art("halloween/ghost.webp", 1090, 18, 100, 116, "ghost")
  ),
  veterans: sceneSvg(
    art("flags/us-flag.webp", 1040, 8, 280, 252, "ripple") +
    groundShadow(130, 516, 100) +
    art("veterans/folded-flag.webp", 12, 370, 210, 148)
  ),
  thanksgiving: sceneSvg(
    autumnLeaves() +
    groundShadow(130, 516, 78) +
    '<g class="turkey-walk">' +
    art("thanksgiving/walk.webp", 6, 292, 250, 226, "turkey-body") +
    art("thanksgiving/fan.webp", -8, 248, 290, 270, "turkey-tail") +
    "</g>"
  ),
  christmas: sceneSvg(
    wreath() + groundShadow(96, 518, 86) +
    art("christmas/tree.webp", 4, 246, 172, 272) +
    treeLights(4, 246, 172, 272) +
    art("christmas/sleigh.webp", 1140, 28, 400, 145, "santa-fly") +
    '<g fill="#f7f7fb">' +
    '<g transform="translate(1040 16)"><circle class="snow" r="16"/></g>' +
    '<g transform="translate(1180 36)"><circle class="snow" style="animation-delay:1.1s" r="13"/></g>' +
    '<g transform="translate(1360 12)"><circle class="snow" style="animation-delay:2.2s" r="18"/></g>' +
    '<g transform="translate(1540 24)"><circle class="snow" style="animation-delay:.6s" r="12"/></g>' +
    "</g>" + roofLights()
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
