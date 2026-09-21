import test from "node:test";
import assert from "node:assert/strict";

import {
  addMinutes,
  availableSlots,
  checkAvailability,
  daysBetween,
  localDateOf,
  overlaps,
  toInstant,
  weekdayOf,
  type AvailabilityWindow,
} from "@/lib/booking/availability";

const HOUR = 3_600_000;

test("Bahrain wall-clock converts to UTC+03:00 year round", () => {
  const instant = toInstant("2026-09-26", "16:30");
  assert.equal(instant?.toISOString(), "2026-09-26T13:30:00.000Z");
  // Bahrain has no daylight saving: the offset is identical in January and July
  assert.equal(toInstant("2026-01-15", "08:00")?.toISOString(), "2026-01-15T05:00:00.000Z");
  assert.equal(toInstant("2026-07-15", "08:00")?.toISOString(), "2026-07-15T05:00:00.000Z");
  assert.equal(toInstant("2026-13-01", "08:00"), null);
  assert.equal(toInstant("2026-01-01", "25:00"), null);
});

test("local date and weekday are computed in Bahrain, not in UTC", () => {
  // 22:30 UTC on the 25th is already the 26th in Bahrain
  assert.equal(localDateOf(new Date("2026-09-25T22:30:00Z")), "2026-09-26");
  assert.equal(weekdayOf("2026-09-26"), 6); // Saturday
  assert.equal(weekdayOf("2026-09-20"), 0); // Sunday
  assert.equal(daysBetween("2026-09-20", "2026-09-26"), 6);
});

test("overlap is half-open: touching boundaries do not conflict", () => {
  const a = toInstant("2026-09-26", "10:00")!;
  const b = toInstant("2026-09-26", "11:00")!;
  const c = toInstant("2026-09-26", "11:00")!;
  const d = toInstant("2026-09-26", "12:00")!;
  assert.equal(overlaps(a, b, c, d), false, "11:00 start must not conflict with an 11:00 end");
  assert.equal(overlaps(a, d, b, c), true, "fully contained ranges must conflict");
  assert.equal(overlaps(a, addMinutes(a, 90), c, d), true, "partial overlap must conflict");
});

const windows: AvailabilityWindow[] = [
  { weekday: 6, startTime: "09:00", endTime: "13:00" }, // Saturday morning
  { weekday: 6, startTime: "16:00", endTime: "20:00" }, // Saturday evening
  { weekday: 1, startTime: "15:00", endTime: "19:00" }, // Monday afternoon
];

const base = {
  windows,
  timeOff: [],
  busy: [],
  rules: { maxAdvanceDays: 60, minLeadTimeHours: 12, allowedDurations: [30, 45, 60, 90, 120] },
  now: new Date("2026-09-20T09:00:00Z"), // Sunday 12:00 in Bahrain
};

test("a request inside an availability window is accepted", () => {
  const res = checkAvailability({ ...base, date: "2026-09-26", time: "10:00", durationMinutes: 60 });
  assert.deepEqual(res, { ok: true, code: "ok" });
});

test("a lesson must fit inside ONE window, not straddle two", () => {
  const res = checkAvailability({ ...base, date: "2026-09-26", time: "12:30", durationMinutes: 60 });
  assert.equal(res.ok, false);
  assert.equal(res.code, "outside_availability");
});

test("weekday without availability is rejected", () => {
  const res = checkAvailability({ ...base, date: "2026-09-22", time: "16:00", durationMinutes: 60 });
  assert.equal(res.code, "outside_availability");
});

test("past, too-soon and too-far-ahead are all refused", () => {
  assert.equal(checkAvailability({ ...base, date: "2026-09-19", time: "10:00", durationMinutes: 60 }).code, "past");
  assert.equal(checkAvailability({ ...base, date: "2026-09-26", time: "09:00", durationMinutes: 30 }).code, "ok");
  // Monday 15:00 is only ~27h after "now" -> allowed; 6 hours later is not
  assert.equal(
    checkAvailability({ ...base, date: "2026-09-21", time: "15:00", durationMinutes: 30 }).ok,
    true,
  );
  const soon = checkAvailability({
    ...base,
    now: new Date("2026-09-26T04:00:00Z"), // Saturday 07:00 in Bahrain
    date: "2026-09-26",
    time: "10:00",
    durationMinutes: 60,
  });
  assert.equal(soon.code, "too_soon");
  const far = checkAvailability({ ...base, date: "2027-05-01", time: "10:00", durationMinutes: 60 });
  assert.equal(far.code, "too_far_ahead");
});

test("a disallowed duration is refused before anything else", () => {
  assert.equal(checkAvailability({ ...base, date: "2026-09-26", time: "10:00", durationMinutes: 200 }).code, "bad_duration");
});

test("time off and existing reservations both block the slot", () => {
  const withOff = {
    ...base,
    timeOff: [{ startsAt: toInstant("2026-09-26", "09:00")!, endsAt: toInstant("2026-09-26", "11:00")! }],
  };
  assert.equal(checkAvailability({ ...withOff, date: "2026-09-26", time: "10:00", durationMinutes: 60 }).code, "time_off");

  const withBusy = {
    ...base,
    busy: [
      { startsAt: toInstant("2026-09-26", "10:30")!, endsAt: toInstant("2026-09-26", "11:30")!, status: "confirmed" as const },
    ],
  };
  assert.equal(checkAvailability({ ...withBusy, date: "2026-09-26", time: "10:00", durationMinutes: 60 }).code, "conflict");
  // the same half hour works at 11:30
  assert.equal(checkAvailability({ ...withBusy, date: "2026-09-26", time: "11:30", durationMinutes: 60 }).ok, true);
});

test("cancelled reservations never block a slot", () => {
  const res = checkAvailability({
    ...base,
    busy: [
      { startsAt: toInstant("2026-09-26", "10:00")!, endsAt: toInstant("2026-09-26", "11:00")!, status: "cancelled" as const },
      { startsAt: toInstant("2026-09-26", "10:00")!, endsAt: toInstant("2026-09-26", "11:00")!, status: "rejected" as const },
    ],
    date: "2026-09-26",
    time: "10:00",
    durationMinutes: 60,
  });
  assert.equal(res.ok, true, "cancelled/rejected bookings must not hold the slot");
});

test("slot generation returns bookable start times only", () => {
  const slots = availableSlots("2026-09-26", 60, base, 30);
  assert.ok(slots.includes("09:00"));
  assert.ok(slots.includes("12:00"));
  assert.ok(!slots.includes("12:30"), "12:30 would run past the 13:00 window end");
  assert.ok(!slots.includes("20:00"), "20:00 would run past the closing time");
  assert.deepEqual([...slots].sort(), slots, "slots must be sorted");
  assert.equal(new Set(slots).size, slots.length, "slots must not repeat");
});

test("a 12-hour lead time is enforced against the injected clock", () => {
  const nearby = availableSlots(
    "2026-09-26",
    60,
    { ...base, now: new Date("2026-09-26T06:00:00Z") }, // 09:00 Bahrain, 1h before the window
    30,
  );
  assert.ok(!nearby.includes("09:00"), "a lesson starting 12h from now must be refused");
});
