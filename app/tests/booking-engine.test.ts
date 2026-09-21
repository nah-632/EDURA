import test from "node:test";
import assert from "node:assert/strict";

import {
  BookingError,
  SlotTakenError,
  applyVerifiedPayment,
  createBookingRequest,
  transitionBooking,
  type BookingRow,
  type BookingStore,
  type CreateBookingRequest,
  type TutorForBooking,
} from "@/lib/booking/engine";
import type { BookingStatus } from "@/lib/booking/state";
import { toInstant, type AvailabilityWindow } from "@/lib/booking/availability";

/** In-memory store: exercises the real decision logic without a database. */
class MemStore implements BookingStore {
  bookings = new Map<string, { row: BookingRow; startsAt: Date; endsAt: Date; request: CreateBookingRequest }>();
  payments: string[] = [];
  notifications: { userId: string; type: string }[] = [];
  audits: string[] = [];
  private seq = 0;
  private codes = new Set<string>();

  constructor(
    private readonly tutors: Record<string, TutorForBooking>,
    private readonly students: Record<string, { id: string; ownerUserId: string; fullName: string; stageId: string | null }>,
    private readonly windows: AvailabilityWindow[] = [{ weekday: 6, startTime: "09:00", endTime: "20:00" }],
    private readonly preexisting: { startsAt: Date; endsAt: Date; status: BookingStatus }[] = [],
  ) {}

  async getTutor(id: string) {
    return this.tutors[id] ?? null;
  }
  async getStudent(id: string) {
    return this.students[id] ?? null;
  }
  async getLessonType(id: string) {
    return id === "lt-private" ? { id, defaultDuration: 60, priceMultiplier: "1.000", isActive: true } : null;
  }
  async getWindows() {
    return this.windows;
  }
  async getTimeOff() {
    return [];
  }
  async getBusy() {
    return [
      ...this.preexisting,
      ...[...this.bookings.values()].map((b) => ({
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        status: b.row.status,
      })),
    ];
  }
  async insertBooking(input: { code: string; request: CreateBookingRequest; price: string; pricePerHour: string; status: BookingStatus }) {
    const startsAt = toInstant(input.request.date, input.request.time)!;
    const endsAt = new Date(startsAt.getTime() + input.request.durationMinutes * 60_000);
    // Mirrors the database exclusion constraint: a reservation-holding booking
    // for an overlapping (tutor, time) tuple is rejected.
    const holds = ["pending_payment", "payment_verification", "paid", "confirmed", "tutor_accepted", "scheduled", "in_progress"];
    for (const b of this.bookings.values()) {
      if (!holds.includes(b.row.status)) continue;
      if (startsAt < b.endsAt && b.startsAt < endsAt) throw new SlotTakenError();
    }
    if (this.codes.has(input.code)) throw new Error("duplicate code");
    this.codes.add(input.code);
    const id = `b-${++this.seq}`;
    const row: BookingRow = { id, code: input.code, status: input.status, price: input.price };
    this.bookings.set(id, { row, startsAt, endsAt, request: input.request });
    return row;
  }
  async findByIdempotencyKey(key: string, customerUserId: string) {
    for (const b of this.bookings.values()) {
      // Mirrors the SQL adapter: a key only resolves for its own customer, so a
      // guessed key cannot read another account's booking back out.
      if (b.request.idempotencyKey === key && b.request.customerUserId === customerUserId) return b.row;
    }
    return null;
  }
  async getBooking(bookingId: string) {
    const found = this.bookings.get(bookingId);
    return found ? { id: found.row.id, status: found.row.status, tutorId: found.request.tutorId } : null;
  }
  async updateStatus(bookingId: string, to: BookingStatus) {
    const b = this.bookings.get(bookingId);
    if (!b) throw new Error("missing booking");
    b.row.status = to;
  }
  async createPaymentForBooking(bookingId: string) {
    this.payments.push(bookingId);
  }
  async notify(userId: string, type: string) {
    this.notifications.push({ userId, type });
  }
}

const tutor: TutorForBooking = {
  id: "t-1",
  userId: "u-tutor",
  status: "approved",
  pricePerHour: "6.500",
  teachesHome: true,
  teachesOnline: true,
  subscriptionActive: true,
  subjectIds: ["s-math"],
  stageIds: ["st-secondary"],
  subjectPriceOverride: null,
};

const student = { id: "st-1", ownerUserId: "u-parent", fullName: "يوسف", stageId: "st-secondary" };

const request: CreateBookingRequest = {
  tutorId: "t-1",
  studentId: "st-1",
  customerUserId: "u-parent",
  subjectId: "s-math",
  stageId: "st-secondary",
  lessonTypeId: "lt-private",
  method: "home",
  date: "2026-09-26", // Saturday
  time: "10:00",
  durationMinutes: 90,
  areaId: "a-riffa",
};

const deps = {
  rules: { maxAdvanceDays: 60, minLeadTimeHours: 12, allowedDurations: [30, 45, 60, 90, 120] },
  now: () => new Date("2026-09-20T06:00:00Z"), // Sunday 09:00 Bahrain
  today: () => "2026-09-20",
  codeFactory: (() => {
    let n = 0;
    return async (day: string) => `EDU-${day.split("-").reverse().join("")}-${String(++n).padStart(4, "0")}`;
  })(),
};

function store() {
  return new MemStore({ "t-1": tutor }, { "st-1": student });
}

test("a valid request creates a pending_payment booking with the right price", async () => {
  const s = store();
  const created = await createBookingRequest(s, deps, request);
  assert.equal(created.status, "pending_payment");
  assert.equal(created.amount, "9.750"); // 6.500 x 1.5h
  assert.equal(created.hourlyRate, "6.500");
  assert.equal(created.code, "EDU-20092026-0001");
  assert.equal(s.payments.length, 1, "a payment record must be created for the booking");
  assert.deepEqual(
    s.notifications.map((n) => n.type).sort(),
    ["booking.created", "booking.new_request"],
  );
});

test("a tutor who is not approved, or has no active subscription, cannot be booked", async () => {
  for (const patch of [{ status: "pending" }, { status: "suspended" }, { subscriptionActive: false }]) {
    const s = new MemStore({ "t-1": { ...tutor, ...patch } }, { "st-1": student });
    await assert.rejects(() => createBookingRequest(s, deps, request), (err: unknown) => {
      assert.ok(err instanceof BookingError);
      assert.equal(err.code, "tutor_not_bookable");
      return true;
    });
  }
});

test("subject, stage and method are validated against the tutor's own profile", async () => {
  const cases: [Partial<CreateBookingRequest>, string][] = [
    [{ subjectId: "s-physics" }, "subject_not_offered"],
    [{ stageId: "st-primary" }, "stage_not_offered"],
  ];
  for (const [patch, code] of cases) {
    const s = store();
    await assert.rejects(() => createBookingRequest(s, deps, { ...request, ...patch }), (err: unknown) => {
      assert.equal((err as BookingError).code, code);
      return true;
    });
  }
  const noHome = new MemStore({ "t-1": { ...tutor, teachesHome: false } }, { "st-1": student });
  await assert.rejects(() => createBookingRequest(noHome, deps, request), (err: unknown) => {
    assert.equal((err as BookingError).code, "method_not_offered");
    return true;
  });
});

test("a student id that does not belong to the signed-in account is refused", async () => {
  const s = store();
  await assert.rejects(
    () => createBookingRequest(s, deps, { ...request, customerUserId: "u-someone-else" }),
    (err: unknown) => {
      assert.equal((err as BookingError).code, "student_not_owned");
      return true;
    },
  );
});

test("availability is re-checked server-side and reports why it failed", async () => {
  const s = store();
  await assert.rejects(() => createBookingRequest(s, deps, { ...request, time: "07:00" }), (err: unknown) => {
    assert.equal((err as BookingError).code, "availability");
    assert.equal((err as BookingError).detail, "outside_availability");
    return true;
  });
  const past = store();
  await assert.rejects(() => createBookingRequest(past, deps, { ...request, date: "2026-09-19" }), (err: unknown) => {
    assert.equal((err as BookingError).detail, "past");
    return true;
  });
});

test("an overlapping request is refused, with the reason available to the UI", async () => {
  const s = store();
  await createBookingRequest(s, deps, request);
  await assert.rejects(
    () => createBookingRequest(s, deps, { ...request, time: "11:00", durationMinutes: 60 }),
    (err: unknown) => {
      assert.ok(err instanceof BookingError);
      assert.equal(err.code, "availability");
      assert.equal(err.detail, "conflict");
      return true;
    },
  );
  // a non-overlapping time is still bookable
  const second = await createBookingRequest(s, deps, { ...request, time: "13:00" });
  assert.equal(second.status, "pending_payment");
});

test("a true race (stale availability read) is still stopped by the constraint", async () => {
  // Two requests read availability at the same instant; the second one's read
  // showed a free slot. The database constraint is the backstop, and the store
  // surfaces it as SlotTakenError -> the route answers 409, never a 500.
  const s = store();
  const stale = s.getBusy.bind(s);
  s.getBusy = async () => []; // simulate the interleaving
  await createBookingRequest(s, deps, request);
  await assert.rejects(
    () => createBookingRequest(s, deps, { ...request, time: "10:00" }),
    (err: unknown) => {
      assert.ok(err instanceof SlotTakenError, "the race must surface as slot_taken");
      return true;
    },
  );
  s.getBusy = stale;
});

test("a cancelled booking releases the slot", async () => {
  const s = store();
  const first = await createBookingRequest(s, deps, request);
  await transitionBooking(s, { bookingId: first.id, to: "cancelled", actor: "customer", actorUserId: "u-parent" });
  const again = await createBookingRequest(s, deps, { ...request, time: "10:00" });
  assert.equal(again.status, "pending_payment");
});

test("the same idempotency key never creates a second booking", async () => {
  const s = store();
  const key = "idem-12345678";
  const a = await createBookingRequest(s, deps, { ...request, idempotencyKey: key });
  const b = await createBookingRequest(s, deps, { ...request, idempotencyKey: key });
  assert.equal(a.id, b.id);
  assert.equal(s.bookings.size, 1);
});

test("an illegal status transition is refused by the engine", async () => {
  const s = store();
  const created = await createBookingRequest(s, deps, request);
  await assert.rejects(
    () => transitionBooking(s, { bookingId: created.id, to: "completed", actor: "admin", actorUserId: "u-admin" }),
    /illegal transition/,
  );
});

test("verifying a payment walks the booking to paid", async () => {
  const s = store();
  const created = await createBookingRequest(s, deps, request);
  await applyVerifiedPayment(s, created.id, "u-admin");
  const after = await s.getBooking(created.id);
  assert.equal(after?.status, "paid");
});

test("an existing reservation in the store blocks the request before any write", async () => {
  const busy = new MemStore({ "t-1": tutor }, { "st-1": student }, [{ weekday: 6, startTime: "09:00", endTime: "20:00" }], [
    { startsAt: toInstant("2026-09-26", "10:00")!, endsAt: toInstant("2026-09-26", "11:00")!, status: "confirmed" },
  ]);
  await assert.rejects(() => createBookingRequest(busy, deps, request), (err: unknown) => {
    assert.equal((err as BookingError).detail, "conflict");
    return true;
  });
  assert.equal(busy.bookings.size, 0, "nothing may be written when the slot is taken");
});
