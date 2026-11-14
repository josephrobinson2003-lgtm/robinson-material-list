import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  THEME_IDS, holidayDate, monthWindows, themeForDutyDate, resolveTheme, themeDecor,
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
    "peoples-day": "2026-10-12",
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
    "peoples-day": "2027-10-11",
    halloween: "2027-10-31",
    veterans: "2027-11-11",
    thanksgiving: "2027-11-25",
    christmas: "2027-12-25"
  }
};

const WINDOWS = {
  2026: {
    1: [["new-year", 1, 9], ["mlk", 10, 31]],
    2: [["groundhog", 1, 7], ["valentines", 8, 14], ["presidents", 15, 28]],
    3: [["st-patricks", 1, 31]],
    4: [["easter", 1, 13], ["earth-day", 14, 22], ["arbor-day", 23, 30]],
    5: [["mothers-day", 1, 17], ["memorial-day", 18, 31]],
    6: [["juneteenth", 1, 19], ["fathers-day", 20, 30]],
    7: [["july-4", 1, 31]],
    8: [],
    9: [["labor-day", 1, 30]],
    10: [["peoples-day", 1, 21], ["halloween", 22, 31]],
    11: [["veterans", 1, 18], ["thanksgiving", 19, 30]],
    12: [["christmas", 1, 31]]
  },
  2027: {
    1: [["new-year", 1, 9], ["mlk", 10, 31]],
    2: [["groundhog", 1, 7], ["valentines", 8, 14], ["presidents", 15, 28]],
    3: [["st-patricks", 1, 22], ["easter", 23, 31]],
    4: [["earth-day", 1, 25], ["arbor-day", 26, 30]],
    5: [["mothers-day", 1, 19], ["memorial-day", 20, 31]],
    6: [["juneteenth", 1, 19], ["fathers-day", 20, 30]],
    7: [["july-4", 1, 31]],
    8: [],
    9: [["labor-day", 1, 30]],
    10: [["peoples-day", 1, 20], ["halloween", 21, 31]],
    11: [["veterans", 1, 17], ["thanksgiving", 18, 30]],
    12: [["christmas", 1, 31]]
  }
};

test("every holiday date for 2026 and 2027", () => {
  for (const year of [2026, 2027]) {
    for (const id of THEME_IDS) {
      assert.equal(holidayDate(id, year), DATES[year][id], id + " " + year);
    }
  }
});

test("every month of 2026 and 2027 uses the midpoint window", () => {
  for (const year of [2026, 2027]) {
    for (let month = 1; month <= 12; month += 1) {
      const actual = monthWindows(year, month).map((window) => [window.theme, window.startDay, window.endDay]);
      assert.deepEqual(actual, WINDOWS[year][month], year + "-" + month);
    }
  }
  assert.equal(themeForDutyDate("2026-08-15"), null);
  assert.equal(themeForDutyDate("2026-11-13"), "veterans");
  assert.equal(themeForDutyDate("2026-11-18"), "veterans");
  assert.equal(themeForDutyDate("2026-11-19"), "thanksgiving");
  assert.equal(themeForDutyDate("2026-02-14"), "valentines");
  assert.equal(themeForDutyDate("2026-02-15"), "presidents");
  assert.equal(themeForDutyDate("2027-04-05"), "earth-day");
  assert.equal(themeForDutyDate("2027-03-28"), "easter");
  for (const year of [2026, 2027]) {
    for (const id of THEME_IDS) {
      assert.equal(themeForDutyDate(DATES[year][id]), id);
    }
  }
});

test("theme override accepts a name, auto, or off", () => {
  assert.equal(resolveTheme("2026-08-01", "auto"), null);
  assert.equal(resolveTheme("2026-08-01", "off"), null);
  assert.equal(resolveTheme("2026-08-01", "christmas"), "christmas");
  assert.equal(resolveTheme("2026-12-25", "not-a-theme"), "christmas");
  assert.equal(resolveTheme("2026-11-13", ""), "veterans");
  let cursor = null;
  for (const id of THEME_IDS) {
    cursor = nextPreviewTheme(cursor);
    assert.equal(cursor, id);
    const markup = themeDecor(id) + themeBanner(id) + themeGreeting(id);
    assert.equal(themeBanner(id).includes("<svg"), true, id);
    assert.equal(themeGreeting(id).length > 3, true, id);
    assert.equal(markup.includes("http"), false, id);
    assert.equal(markup.includes("$"), false, id);
  }
  assert.equal(nextPreviewTheme("christmas"), "new-year");
  const motion = {
    christmas: ["snow", "bulb-color", "wreath", "santa-fly"],
    "new-year": ["spark", "fuse"],
    veterans: ["wave", "ripple"],
    thanksgiving: ["leaf-fall", "turkey-walk", "turkey-tail"],
    halloween: ["ghost"],
    valentines: ["float-up"],
    "st-patricks": ["picker", "coin"],
    easter: ["hopper", "egg-wobble"],
    groundhog: ["groundhog", "snow"],
    "labor-day": ["labor-work", "wave"],
    "arbor-day": ["arbor-tree", "arbor-seed"],
    "earth-day": ["earth-globe", "sprout-sway"],
    "mothers-day": ["bloom"],
    "fathers-day": ["float-up"],
    mlk: ["banner-shimmer"],
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
  const illustrated = ["thanksgiving", "christmas", "labor-day", "easter", "groundhog", "arbor-day", "earth-day", "mothers-day", "fathers-day"];
  for (const id of illustrated) {
    assert.match(themeDecor(id), /holiday\/[a-z0-9-]+\/[a-z0-9-]+\.webp/, id);
    assert.equal(themeDecor(id).includes("blended"), false, id);
  }
  for (const id of THEME_IDS) {
    if (illustrated.includes(id)) continue;
    assert.equal(themeDecor(id).replace(/holiday\/leaves\/[a-z0-9-]+\.webp/g, "").includes("holiday/"), false, id);
  }
  assert.match(css, /holiday-paused/);
  assert.match(css, /animation-play-state:\s*paused/);
});
