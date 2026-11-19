import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  THEME_IDS, PREVIEW_IDS, holidayDate, themeForDutyDate, resolveTheme, themeDecor,
  themeBanner, themeGreeting, nextPreviewTheme
} from "../js/holiday-theme.js";

const DATES = {
  2026: {
    "new-year": "2026-01-01",
    mlk: "2026-01-19",
    groundhog: "2026-02-02",
    valentines: "2026-02-14",
    presidents: "2026-02-16",
    "st-patricks": "2026-03-17",
    easter: "2026-04-05",
    "arbor-day": "2026-04-24",
    "earth-day": "2026-04-22",
    "mothers-day": "2026-05-10",
    "memorial-day": "2026-05-25",
    "fathers-day": "2026-06-21",
    juneteenth: "2026-06-19",
    "july-4": "2026-07-04",
    "labor-day": "2026-09-07",
    columbus: "2026-10-12",
    halloween: "2026-10-31",
    veterans: "2026-11-11",
    thanksgiving: "2026-11-26",
    christmas: "2026-12-25"
  },
  2027: {
    "new-year": "2027-01-01",
    mlk: "2027-01-18",
    groundhog: "2027-02-02",
    valentines: "2027-02-14",
    presidents: "2027-02-15",
    "st-patricks": "2027-03-17",
    easter: "2027-03-28",
    "arbor-day": "2027-04-30",
    "earth-day": "2027-04-22",
    "mothers-day": "2027-05-09",
    "memorial-day": "2027-05-31",
    "fathers-day": "2027-06-20",
    juneteenth: "2027-06-19",
    "july-4": "2027-07-04",
    "labor-day": "2027-09-06",
    columbus: "2027-10-11",
    halloween: "2027-10-31",
    veterans: "2027-11-11",
    thanksgiving: "2027-11-25",
    christmas: "2027-12-25"
  }
};

test("every holiday date for 2026 and 2027", () => {
  for (const year of [2026, 2027]) {
    for (const id of THEME_IDS) {
      assert.equal(holidayDate(id, year), DATES[year][id], id + " " + year);
    }
  }
});

function shift(duty, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(duty);
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return dt.toISOString().slice(0, 10);
}

test("holiday dates still show that holiday, and lead-ins fill the days before", () => {
  for (const year of [2026, 2027, 2028]) {
    for (const id of THEME_IDS) {
      assert.equal(themeForDutyDate(holidayDate(id, year)), id, id + " " + year);
    }
    const thanksgiving = holidayDate("thanksgiving", year);
    const fallEnd = shift(thanksgiving, -5);
    const fullStart = shift(thanksgiving, -4);
    const fullEnd = shift(thanksgiving, 2);
    const winterStart = shift(thanksgiving, 3);
    assert.equal(themeForDutyDate(year + "-11-11"), "veterans");
    assert.equal(themeForDutyDate(year + "-11-12"), "fall");
    assert.equal(themeForDutyDate(fallEnd), "fall");
    assert.equal(themeGreeting("fall"), "");
    assert.equal(themeForDutyDate(fullStart), "thanksgiving");
    assert.equal(themeForDutyDate(thanksgiving), "thanksgiving");
    assert.equal(themeForDutyDate(fullEnd), "thanksgiving");
    assert.equal(themeGreeting("thanksgiving"), "Happy Thanksgiving");
    assert.equal(themeForDutyDate(winterStart), "winter");
    assert.equal(themeGreeting("winter"), "");
    assert.equal(themeForDutyDate(year + "-12-10"), "winter");
    assert.equal(themeForDutyDate(year + "-12-11"), "happy-holidays");
    assert.equal(themeForDutyDate(year + "-12-24"), "happy-holidays");
    assert.equal(themeGreeting("happy-holidays"), "Happy Holidays");
    assert.equal(themeForDutyDate(year + "-12-25"), "christmas");
    assert.equal(themeForDutyDate(year + "-12-26"), "subtle-new-year");
    assert.equal(themeGreeting("subtle-new-year"), "");
    assert.equal(themeForDutyDate((year + 1) + "-01-01"), "new-year");
  }
  assert.equal(themeForDutyDate("2026-03-01"), null);
  assert.equal(themeForDutyDate("2027-03-01"), null);
  assert.equal(themeForDutyDate("2028-02-29"), "winter");
  assert.equal(themeForDutyDate("2026-08-15"), null);
  assert.equal(themeForDutyDate("2026-02-14"), "valentines");
  assert.equal(themeForDutyDate("2026-02-15"), "subtle-presidents");
  assert.equal(themeDecor("fall").includes("holiday/"), true);
  assert.equal(themeDecor("happy-holidays").includes("tree.webp"), false);
  assert.equal(themeDecor("happy-holidays").includes("sleigh.webp"), false);
  assert.equal(themeDecor("winter").includes("snow"), true);
  assert.equal(PREVIEW_IDS.includes("fall"), true);
  assert.equal(PREVIEW_IDS.includes("winter"), true);
  assert.equal(PREVIEW_IDS.includes("happy-holidays"), true);
  assert.equal(PREVIEW_IDS.includes("subtle-memorial-day"), true);
});

test("theme override accepts a name, auto, or off", () => {
  assert.equal(resolveTheme("2026-08-01", "auto"), null);
  assert.equal(resolveTheme("2026-08-01", "off"), null);
  assert.equal(resolveTheme("2026-08-01", "christmas"), "christmas");
  assert.equal(resolveTheme("2026-12-25", "not-a-theme"), "christmas");
  assert.equal(resolveTheme("2026-11-13", ""), "fall");
  let cursor = null;
  for (const id of PREVIEW_IDS) {
    cursor = nextPreviewTheme(cursor);
    assert.equal(cursor, id);
    const markup = themeDecor(id) + themeBanner(id) + themeGreeting(id);
    assert.equal(themeBanner(id).includes("<svg"), true, id);
    if (id !== "fall" && id !== "winter" && !id.startsWith("subtle-")) assert.equal(themeGreeting(id).length > 3, true, id);
    assert.equal(markup.includes("http"), false, id);
    assert.equal(markup.includes("$"), false, id);
  }
  assert.equal(nextPreviewTheme("subtle-christmas"), "fall");
  const motion = {
    christmas: ["snow", "bulb-color", "wreath", "santa-fly"],
    "new-year": ["spark", "fuse"],
    veterans: ["wave", "ripple"],
    thanksgiving: ["leaf-fall", "turkey-walk", "turkey-tail"],
    halloween: ["ghost"],
    valentines: ["float-up"],
    "st-patricks": ["drift"],
    easter: ["hopper", "egg-wobble"],
    groundhog: ["groundhog", "snow"],
    "labor-day": ["labor-work", "wave"],
    "arbor-day": ["arbor-tree", "arbor-seed"],
    "earth-day": ["earth-globe", "sprout-sway"],
    "mothers-day": ["bloom"],
    "fathers-day": ["float-up"],
    mlk: ["wave"],
    "july-4": ["twinkle", "ripple"]
  };
  for (const id of Object.keys(motion)) {
    const markup = themeDecor(id) + themeBanner(id);
    for (const name of motion[id]) assert.match(markup, new RegExp('class="[^"]*\\b' + name + '\\b'), id + " " + name);
  }
  const css = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const reduced = css.match(/@media \(prefers-reduced-motion:\s*reduce\)\{([^}]+)\}/);
  assert.ok(reduced, "reduced-motion block");
  assert.match(reduced[1], /animation:\s*none/);
  assert.equal((themeDecor("christmas") + themeBanner("christmas")).includes("Q1120"), false);
  for (const name of ["twinkle", "bulb-color", "wave", "wreath", "ripple", "snow", "drift", "float-up", "bob", "bat", "wing", "glow", "fuse", "spark", "turkey-walk", "turkey-tail", "santa-fly", "ghost", "hopper", "groundhog", "sprout", "hammer", "salute", "fade-in", "banner-shimmer", "labor-work", "egg-wobble", "earth-globe", "bloom", "arbor-tree", "sprout-sway", "leaf-fall"]) {
    assert.match(reduced[1], new RegExp("\\." + name + "(?:,|\\{)"));
  }
  for (const id of THEME_IDS) {
    assert.match(themeDecor(id), /holiday\/[a-z0-9-]+\/[a-z0-9-]+\.webp/, id);
    assert.equal(themeDecor(id).includes("blended"), false, id);
  }
  const fontCss = readFileSync(new URL("../fonts/holiday.css", import.meta.url), "utf8");
  assert.equal(fontCss.includes("http"), false);
  assert.match(fontCss, /@font-face/);
  assert.match(css, /fonts\/holiday\.css/);
  for (const face of ["mountains-of-christmas", "great-vibes", "pinyon-script", "creepster", "irish-grover", "stardos-stencil", "cinzel-decorative", "libre-baskerville", "fredoka", "patrick-hand", "caveat", "quicksand", "oswald", "righteous", "playfair-display"]) {
    assert.match(fontCss, new RegExp(face + "\\.woff2"));
  }
  assert.match(css, /holiday-paused/);
  assert.match(css, /animation-play-state:\s*paused/);
});
