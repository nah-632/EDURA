import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  createTranslator,
  dictionaries,
  formatAmount,
  formatDate,
  formatDuration,
  formatMoney,
  formatPhone,
  formatTime,
  groupDigits,
  resolveLocale,
  switchLocalePath,
  toFixedString,
} from "@/lib/i18n";
import { localeDir, localeMeta, locales } from "@/lib/i18n/types";

test("both locales exist and Arabic is the default", () => {
  assert.deepEqual([...locales], ["ar", "en"]);
  assert.equal(resolveLocale(undefined), "ar");
  assert.equal(resolveLocale("de"), "ar");
  assert.equal(resolveLocale("en"), "en");
  assert.equal(localeDir.ar, "rtl");
  assert.equal(localeDir.en, "ltr");
  assert.equal(localeMeta.ar.htmlLang, "ar-BH");
});

test("dictionary keys match exactly between Arabic and English", () => {
  const arKeys = Object.keys(dictionaries.ar).sort();
  const enKeys = Object.keys(dictionaries.en).sort();
  const missingInEn = arKeys.filter((k) => !(k in dictionaries.en));
  const missingInAr = enKeys.filter((k) => !(k in dictionaries.ar));
  assert.deepEqual(missingInEn, [], `keys missing from English: ${missingInEn.join(", ")}`);
  assert.deepEqual(missingInAr, [], `keys missing from Arabic: ${missingInAr.join(", ")}`);
  assert.ok(arKeys.length > 400, `expected a full bilingual dictionary, found ${arKeys.length} keys`);
});

test("no duplicate keys across dictionary modules", () => {
  // A duplicate would silently override an earlier module in the composer, so
  // the module sources are scanned rather than the merged object.
  const seen = new Map<string, number>();
  const modules = ["common", "public", "booking", "account", "tutor", "admin", "legal", "trust"];
  const root = process.env.EDURA_APP_DIR ?? process.cwd();
  for (const mod of modules) {
    const src = fs.readFileSync(path.join(root, "src", "lib", "i18n", "dict", `${mod}.ts`), "utf8");
    for (const match of src.matchAll(/"([a-zA-Z0-9_.]+)":/g)) {
      const key = match[1]!;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  // each key legitimately appears once per language, so anything above 2 is a dup
  const dupes = [...seen.entries()].filter(([, count]) => count > 2);
  assert.deepEqual(dupes, [], `duplicated keys: ${dupes.map(([k, c]) => `${k}(${c})`).join(", ")}`);
});

test("no key is left untranslated (Arabic text in the English dictionary)", () => {
  const arabic = /[\u0600-\u06FF]/;
  // brand.nameLatin is intentional; everything else must be English.
  const offenders = Object.entries(dictionaries.en)
    .filter(([key, value]) => key !== "brand.nameLatin" && arabic.test(value))
    .map(([key]) => key);
  assert.deepEqual(offenders, [], `English values containing Arabic text: ${offenders.join(", ")}`);
});

test("placeholders match between languages", () => {
  const bad: string[] = [];
  for (const key of Object.keys(dictionaries.ar)) {
    const arVars = [...(dictionaries.ar[key] ?? "").matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const enVars = [...(dictionaries.en[key] ?? "").matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    if (arVars.join(",") !== enVars.join(",")) bad.push(key);
  }
  assert.deepEqual(bad, [], `placeholder mismatch: ${bad.join(", ")}`);
});

test("translation interpolates and falls back loudly", () => {
  const t = createTranslator("ar");
  assert.equal(t("booking.list.with", { tutor: "أحمد" }), "مع أحمد");
  const tEn = createTranslator("en");
  assert.equal(tEn("booking.list.with", { tutor: "Ahmed" }), "with Ahmed");
});

test("BHD keeps three decimals and Latin digits in both languages", () => {
  assert.equal(formatMoney("12.5", "ar"), "12.500 د.ب");
  assert.equal(formatMoney("12.5", "en"), "BHD 12.500");
  assert.equal(formatMoney("1234567.999", "ar"), "1,234,567.999 د.ب");
  assert.equal(formatMoney(0, "ar"), "0.000 د.ب");
  assert.equal(formatMoney(null, "ar"), "—");
  // no Arabic-Indic digits anywhere
  assert.ok(!/[\u0660-\u0669]/.test(formatMoney("1234.5", "ar")));
});

test("decimal handling never goes through a float", () => {
  assert.equal(toFixedString("0.1", 3), "0.100");
  assert.equal(toFixedString("5", 3), "5.000");
  assert.equal(toFixedString("9.9999", 3), "9.999");
  assert.equal(toFixedString("1000.5", 0), "1000");
  assert.equal(groupDigits("1234567"), "1,234,567");
  assert.equal(formatAmount("42", 3), "42.000");
});

test("dates and times render in Bahrain time with Latin digits", () => {
  const instant = new Date("2026-09-20T13:30:00Z"); // 16:30 in Bahrain
  const arTime = formatTime(instant, "ar");
  assert.match(arTime, /4:30/, `expected 4:30 in ${arTime}`);
  assert.ok(!/[\u0660-\u0669]/.test(arTime));
  const date = formatDate(instant, "en");
  assert.match(date, /2026/);
  assert.match(date, /September|Sep/);
});

test("duration and phone helpers", () => {
  assert.equal(formatDuration(90, "ar"), "1 س 30 د");
  assert.equal(formatDuration(90, "en"), "1 h 30 m");
  assert.equal(formatDuration(60, "en"), "1 h");
  assert.equal(formatDuration(45, "en"), "45 m");
  assert.equal(formatPhone("+97366661238"), "+973 6666 1238");
});

test("language switch keeps the current path", () => {
  assert.equal(switchLocalePath("/ar/tutors/abc", "en"), "/en/tutors/abc");
  assert.equal(switchLocalePath("/en", "ar"), "/ar");
  assert.equal(switchLocalePath("/tutors", "ar"), "/ar/tutors");
});
