import test from "node:test";
import assert from "node:assert/strict";

import {
  MoneyError,
  fromMillimes,
  lessonAmountMilli,
  percentOfMilli,
  priceBreakdown,
  toMillimes,
} from "@/lib/booking/pricing";
import { formatBookingCode, isBookingCode, parseBookingCode } from "@/lib/booking/code";

test("decimal strings convert to integer millimes exactly", () => {
  assert.equal(toMillimes("12.5"), 12500);
  assert.equal(toMillimes("0.001"), 1);
  assert.equal(toMillimes("1000"), 1_000_000);
  assert.equal(fromMillimes(toMillimes("12.5")), "12.500");
  assert.equal(fromMillimes(toMillimes("0.05")), "0.050");
});

test("rejects anything that is not a 3-decimal amount", () => {
  for (const bad of ["1.2345", "-5", "1,000", "abc", "1e3", ""]) {
    assert.throws(() => toMillimes(bad), MoneyError, `expected ${bad} to be rejected`);
  }
});

test("lesson price = hourly rate x duration x multiplier, rounded half-up", () => {
  // 5.000 BHD/hour, 90 minutes, standard lesson
  assert.equal(lessonAmountMilli(5000, 90, 1000), 7500);
  // 7.500 BHD/hour, 45 minutes
  assert.equal(lessonAmountMilli(7500, 45, 1000), 5625);
  // intensive course (1.250x) for 60 minutes at 8.000
  assert.equal(lessonAmountMilli(8000, 60, 1250), 10000);
  // rounding: 3.333/hour for 20 minutes -> 1.111
  assert.equal(lessonAmountMilli(3333, 20, 1000), 1111);
});

test("price breakdown exposes the numbers the booking row stores", () => {
  const b = priceBreakdown("6.500", 90, "1.000");
  assert.equal(b.hourly, "6.500");
  assert.equal(b.total, "9.750");
  assert.equal(b.durationMinutes, 90);
  assert.equal(b.totalMilli, 9750);
});

test("percent helper stays in integer arithmetic", () => {
  assert.equal(percentOfMilli(10000, 50), 5000);
  assert.equal(percentOfMilli(9999, 33), 3300);
});

test("booking codes follow EDU-DDMMYYYY-XXXX and round-trip", () => {
  const code = formatBookingCode(new Date(Date.UTC(2026, 8, 26)), 1);
  assert.equal(code, "EDU-26092026-0001");
  const parsed = parseBookingCode(code);
  assert.deepEqual(parsed, { date: "2026-09-26", sequence: 1 });
  assert.ok(isBookingCode("EDU-01012026-9999"));
  assert.ok(!isBookingCode("EDU-32012026-0001"));
  assert.ok(!isBookingCode("edu26092026-1"));
  assert.throws(() => formatBookingCode(new Date(), 0));
  assert.throws(() => formatBookingCode(new Date(), 10000));
});
