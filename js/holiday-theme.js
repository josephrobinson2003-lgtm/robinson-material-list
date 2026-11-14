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

function christmasTree(x, y, s) {
  const lights = [
    [-18, -40, "#d32f2f"], [16, -28, "#f2c200"], [-8, -8, "#2456a6"],
    [22, 8, "#ef6c00"], [-24, 18, "#d32f2f"], [8, 28, "#f2c200"], [-14, 48, "#1b8a3a"]
  ];
  let bulbs = "";
  lights.forEach(function (bulb, i) {
    bulbs += '<circle cx="' + bulb[0] + '" cy="' + bulb[1] + '" r="7" fill="' + bulb[2] + '" opacity="0.28"/>' +
      '<circle class="glow" cx="' + bulb[0] + '" cy="' + bulb[1] + '" r="4.5" fill="' + bulb[2] + '"/>' +
      '<circle cx="' + (bulb[0] - 1.2) + '" cy="' + (bulb[1] - 1.4) + '" r="1.3" fill="#fff" opacity="0.8"/>';
  });
  return '<g transform="translate(' + x + " " + y + ") scale(" + (s || 1) + ')">' +
    '<polygon points="6,-150 78,20 -52,28" fill="#0d3d22"/>' +
    '<polygon points="0,-168 62,-78 -62,-78" fill="#146b38"/>' +
    '<polygon points="0,-168 48,-96 -22,-92" fill="#1f8a48" opacity="0.9"/>' +
    '<polygon points="4,-108 86,-8 -70,-4" fill="#0f4d28"/>' +
    '<polygon points="0,-118 74,-18 -74,-18" fill="#187a3c"/>' +
    '<polygon points="-8,-112 28,-40 -36,-36" fill="#2a9a50" opacity="0.85"/>' +
    '<polygon points="2,-48 96,36 -84,40" fill="#0c4224"/>' +
    '<polygon points="0,-58 88,28 -88,28" fill="#146b34"/>' +
    '<polygon points="0,-52 40,-8 -18,-6" fill="#23864a" opacity="0.8"/>' +
    '<polygon points="0,2 104,78 -96,82" fill="#0a3820"/>' +
    '<polygon points="0,-8 96,70 -96,70" fill="#125c2e"/>' +
    '<polygon points="-6,-2 36,28 -30,30" fill="#1f7a40" opacity="0.75"/>' +
    '<rect x="-11" y="70" width="22" height="28" rx="2" fill="#5c3a1e"/>' +
    '<rect x="-7" y="74" width="5" height="24" fill="#7a5230" opacity="0.7"/>' +
    bulbs +
    '<polygon points="0,-196 8,-174 -8,-174" fill="#f2c200"/>' +
    '<polygon points="0,-164 10,-186 -10,-186" fill="#f2c200"/>' +
    '<circle class="glow" cy="-180" r="8" fill="#ffe27a" opacity="0.85"/>' +
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
  "new-year": sceneSvg(firework(1140, 78, 0) + firework(1288, 36, 1.6) + firework(1420, 96, 3.2)),
  mlk: sceneSvg(""),
  valentines: sceneSvg(heart(1040, 16, 1.8, "#c23b56", 0) + heart(1240, 55, 1.2, "#e89aaf", 1.4)),
  presidents: sceneSvg(flag(1000, 10, 220, 130) + star(1260, 36, 26, "#FFC20E", 0.4)),
  easter: sceneSvg(
    groundShadow(78, 516, 58) + groundShadow(210, 516, 48) +
    art("easter/egg-1.webp", 268, 468, 36, 50, "egg-wobble", 0) +
    art("easter/egg-2.webp", 308, 474, 36, 50, "egg-wobble", 1.2) +
    art("easter/egg-3.webp", 348, 466, 34, 48, "egg-wobble", 2.4) +
    art("easter/egg-4.webp", 384, 476, 32, 44, "egg-wobble", 3.6) +
    art("easter/egg-5.webp", 418, 470, 32, 44, "egg-wobble", 4.8) +
    art("easter/basket.webp", 156, 392, 140, 126) +
    art("easter/bunny.webp", 4, 368, 150, 150, "hopper")
  ),
  "st-patricks": sceneSvg(
    shamrock(1490, 70, 1.2, 0) + shamrock(1540, 160, 1, 1) + shamrock(1460, 250, 0.9, 0.6) + shamrock(1520, 340, 1.05, 1.4) +
    groundShadow(96, 516, 36) +
    '<g transform="translate(210 500)"><ellipse class="coin" cx="0" cy="0" rx="20" ry="13" fill="#FFC20E"/></g>' +
    '<g transform="translate(262 508)"><ellipse class="coin" style="animation-delay:3.5s" cx="0" cy="0" rx="20" ry="13" fill="#e0b33a"/></g>' +
    '<g transform="translate(314 498)"><ellipse class="coin" style="animation-delay:7s" cx="0" cy="0" rx="20" ry="13" fill="#FFC20E"/></g>' +
    '<g transform="translate(96 512)"><g class="picker">' +
    '<rect x="-7" y="-196" width="14" height="26" fill="#1f7a3a"/>' +
    '<path d="M-44 -172 H44 L36 -150 H-36 Z" fill="#1f7a3a"/>' +
    '<circle cy="-126" r="26" fill="#f0d2b0"/>' +
    '<path d="M-20 -116 Q0 -86 20 -116 Q14 -104 0 -96 Q-14 -104 -20 -116 Z" fill="#efe4d4"/>' +
    '<path d="M-32 -108 H32 L40 -24 H-40 Z" fill="#1f7a3a"/>' +
    '<rect x="-32" y="-64" width="64" height="12" fill="#1d2330"/>' +
    '<rect x="-8" y="-68" width="16" height="20" fill="#FFC20E"/>' +
    '<rect x="-28" y="-24" width="18" height="20" fill="#1d2330"/>' +
    '<rect x="10" y="-24" width="18" height="20" fill="#1d2330"/>' +
    '<ellipse cx="-18" cy="2" rx="20" ry="9" fill="#1d2330"/>' +
    '<ellipse cx="18" cy="2" rx="20" ry="9" fill="#1d2330"/>' +
    "</g></g>"
  ),
  groundhog: sceneSvg(
    '<g fill="#c5d0e0">' +
    '<g transform="translate(160 18)"><circle class="snow" r="5"/></g>' +
    '<g transform="translate(480 8)"><circle class="snow" style="animation-delay:1.1s" r="4"/></g>' +
    '<g transform="translate(760 24)"><circle class="snow" style="animation-delay:.5s" r="6"/></g>' +
    '<g transform="translate(1040 10)"><circle class="snow" style="animation-delay:1.7s" r="4"/></g>' +
    "</g>" +
    groundShadow(170, 516, 100) +
    art("groundhog/hog.webp", 70, 332, 230, 168, "groundhog") +
    art("groundhog/mound.webp", 16, 428, 330, 90)
  ),
  "arbor-day": sceneSvg(
    groundShadow(155, 516, 62) +
    art("arbor-day/seed.webp", 112, 468, 86, 50, "arbor-stage arbor-seed") +
    art("arbor-day/sprout.webp", 104, 424, 100, 94, "arbor-stage arbor-sprout") +
    art("arbor-day/sapling.webp", 96, 372, 112, 146, "arbor-stage arbor-sapling") +
    art("arbor-day/tree.webp", 36, 300, 210, 218, "arbor-stage arbor-tree") +
    art("arbor-day/vine.webp", 800, 16, 300, 198, "wave")
  ),
  "earth-day": sceneSvg(
    '<g class="earth-globe">' +
    art("earth-day/globe.webp", 1168, 108, 214, 212) +
    art("earth-day/sprout.webp", 1236, 42, 78, 80, "sprout-sway") +
    "</g>" +
    art("earth-day/leaf-1.webp", 1040, 36, 30, 42, "drift", 0) +
    art("earth-day/leaf-2.webp", 1488, 48, 36, 34, "drift", 1.1) +
    art("earth-day/leaf-3.webp", 1100, 150, 32, 34, "drift", 0.6) +
    art("earth-day/leaf-4.webp", 1420, 200, 28, 30, "drift", 1.8) +
    art("earth-day/leaf-5.webp", 1520, 120, 30, 26, "drift", 0.3) +
    art("earth-day/leaf-6.webp", 1008, 90, 34, 32, "drift", 1.4)
  ),
  "mothers-day": sceneSvg(
    groundShadow(160, 516, 100) +
    '<ellipse class="glow" cx="130" cy="455" rx="80" ry="30" fill="#f7b0c4"/>' +
    art("mothers-day/heart.webp", 4, 418, 220, 96, "bloom", 0) +
    art("mothers-day/flower-1.webp", 150, 400, 120, 112, "bloom", 0.6) +
    art("mothers-day/flower-2.webp", 40, 392, 110, 100, "bloom", 1.2) +
    art("mothers-day/flower-4.webp", 210, 408, 120, 104, "bloom", 1.8) +
    art("mothers-day/petal-1.webp", 1040, 24, 36, 42, "drift", 0) +
    art("mothers-day/petal-2.webp", 1220, 48, 34, 32, "drift", 1.2) +
    art("mothers-day/petal-3.webp", 1400, 16, 40, 24, "drift", 0.6) +
    art("mothers-day/petal-4.webp", 1120, 80, 32, 26, "drift", 1.8)
  ),
  "fathers-day": sceneSvg(
    art("fathers-day/tie.webp", 36, 148, 62, 148, "wave") +
    groundShadow(80, 516, 50) + groundShadow(210, 516, 36) +
    art("fathers-day/grill.webp", 4, 300, 180, 218) +
    '<g transform="translate(58 324)"><g class="float-up"><path d="M0 28 C8 16 -6 12 2 0" fill="none" stroke="#c5cad3" stroke-width="4" stroke-linecap="round"/></g></g>' +
    '<g transform="translate(86 312)"><g class="float-up" style="animation-delay:1.1s"><path d="M0 34 C-8 18 8 12 0 -4" fill="none" stroke="#d5dae2" stroke-width="3.5" stroke-linecap="round"/></g></g>' +
    art("fathers-day/toolbox.webp", 148, 412, 108, 106) +
    art("fathers-day/driver.webp", 230, 468, 96, 50)
  ),
  "memorial-day": sceneSvg(flag(1000, 16, 240, 140)),
  juneteenth: sceneSvg(star(1120, 90, 64, "#e0b33a") + '<path fill="#bb3a2f" d="M980 150 a150 64 0 0 1 300 0 z"/>'),
  "july-4": sceneSvg(flag(760, 20, 200, 110) + firework(1240, 70, 0.4) + firework(1420, 110, 2.2)),
  "labor-day": sceneSvg(
    bunting() +
    art("labor-day/electrician.webp", 960, 148, 168, 328, "labor-work")
  ),
  "peoples-day": sceneSvg(""),
  halloween: sceneSvg(
    autumnLeaves(4) +
    groundShadow(42, 516, 22) + groundShadow(110, 516, 18) + groundShadow(176, 516, 24) +
    '<g transform="translate(12 392) scale(2.3)"><rect width="36" height="48" fill="#4a5568"/><rect x="10" y="28" width="16" height="20" fill="#2a3140"/></g>' +
    '<g transform="translate(110 424) scale(2.3)"><rect width="30" height="36" fill="#5c6778"/><path d="M0 0 L15 -16 L30 0 Z" fill="#5c6778"/></g>' +
    '<g transform="translate(200 400) scale(2.3)"><rect width="40" height="44" fill="#3d4654"/><rect x="12" y="24" width="16" height="20" fill="#232830"/></g>' +
    '<g transform="translate(620 340) scale(1.8)"><g class="ghost" fill="#f7f7fb" opacity="0.72"><ellipse cx="0" cy="0" rx="22" ry="28"/><path d="M-22 8 L-14 24 L-6 8 L2 24 L10 8 L18 24 L22 8 Z"/><circle cx="-8" cy="-6" r="3" fill="#1d2330"/><circle cx="8" cy="-6" r="3" fill="#1d2330"/></g></g>' +
    '<g transform="translate(960 370) scale(1.6)"><g class="ghost" style="animation-delay:3.2s" fill="#f7f7fb" opacity="0.6"><ellipse cx="0" cy="0" rx="18" ry="24"/><circle cx="-6" cy="-4" r="2.5" fill="#1d2330"/><circle cx="6" cy="-4" r="2.5" fill="#1d2330"/></g></g>' +
    '<g transform="translate(1220 320) scale(1.6)"><g class="ghost" style="animation-delay:6s" fill="#f7f7fb" opacity="0.66"><ellipse cx="0" cy="0" rx="20" ry="26"/><circle cx="-6" cy="-4" r="2.5" fill="#1d2330"/><circle cx="7" cy="-4" r="2.5" fill="#1d2330"/></g></g>'
  ),
  veterans: sceneSvg(
    '<rect x="900" y="0" width="420" height="210" fill="#0c1830" opacity="0.72"/>' +
    star(980, 36, 10, "#f7f7fb", 0.2) + star(1120, 70, 8, "#f7f7fb", 0.8) + star(1240, 28, 9, "#f7f7fb", 1.3) +
    flag(980, 48, 220, 120) +
    groundShadow(40, 516, 30) + groundShadow(170, 516, 26) +
    '<g transform="translate(36 508)" fill="#1d2330"><g class="salute"><circle cy="-120" r="20"/><path d="M-22 -96 H22 L16 -16 H-16 Z"/><path d="M6 -70 L48 -112" stroke="#1d2330" stroke-width="8"/><path d="M-10 -16 L-16 18 M12 -16 L18 18" stroke="#1d2330" stroke-width="8"/></g></g>' +
    '<g transform="translate(168 516)" fill="#1d2330"><g class="salute" style="animation-delay:.6s"><circle cy="-100" r="16"/><path d="M-18 -80 H18 L14 -12 H-14 Z"/><path d="M4 -58 L36 -96" stroke="#1d2330" stroke-width="7"/><path d="M-8 -12 L-12 14 M10 -12 L14 14" stroke="#1d2330" stroke-width="7"/></g></g>'
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
    wreath() + groundShadow(118, 516, 72) + christmasTree(118, 420, 1) +
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
