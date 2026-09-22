import test from "node:test";
import assert from "node:assert/strict";

import {
  createBookingRequest,
  type BookingStore,
  type BookingRow,
  type CreateBookingRequest,
  type TutorForBooking,
} from "@/lib/booking/engine";
import type { AvailabilityWindow } from "@/lib/booking/availability";

/**
 * Idempotency scoping (regression test for a real defect).
 *
 * The key used to be matched by VALUE alone, and the client derives it from the
 * tutor, date, time and duration - all public. Anyone could therefore send a
 * booking request carrying someone else's key and receive that person's booking
 * (code, price, status) back instead of creating one. The lookup is now scoped
 * by the requesting customer, and this test pins that down.
 */
class Store implements BookingStore {
  readonly byKey = new Map<string, BookingRow & { customerUserId: string }>();
  inserted = 0;

  // The return type is annotated so the literal is checked against
  // TutorForBooking instead of being widened - `status` inferred as `string` is
  // what made this class fail to implement BookingStore.
  async getTutor(): Promise<TutorForBooking | null> {
    return {
      id: "t1",
      userId: "u-tutor",
      status: "approved",
      pricePerHour: "8.500",
      teachesHome: true,
      teachesOnline: true,
      subscriptionActive: true,
      subjectIds: ["s1"],
      stageIds: ["st1"],
    };
  }
  async getStudent(studentId: string) {
    // Each customer owns their own student, which is exactly what the engine
    // checks before it trusts a student id from a request body.
    const owner = studentId === "stu-attacker" ? "u-attacker" : "u-owner";
    return { id: studentId, ownerUserId: owner, fullName: "Child", stageId: null };
  }
  async getLessonType() {
    return { id: "lt1", defaultDuration: 60, priceMultiplier: "1.000", isActive: true };
  }
  async getWindows(): Promise<AvailabilityWindow[]> {
    // Open every day: this test is about key scoping, not about the calendar.
    return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "08:00", endTime: "22:00" }));
  }
  async getTimeOff() {
    return [];
  }
  async getBusy() {
    return [];
  }
  async findByIdempotencyKey(key: string, customerUserId: string) {
    const found = this.byKey.get(key);
    // The scope is the whole point: a key belonging to somebody else must not
    // resolve, whatever the caller sends.
    if (!found || found.customerUserId !== customerUserId) return null;
    return found;
  }
  async insertBooking(input: { code: string; request: CreateBookingRequest; price: string; pricePerHour: string }): Promise<BookingRow> {
    this.inserted += 1;
    const row: BookingRow = { id: `b${this.inserted}`, code: input.code, status: "pending_payment", price: input.price };
    if (input.request.idempotencyKey) {
      this.byKey.set(input.request.idempotencyKey, { ...row, customerUserId: input.request.customerUserId });
    }
    return row;
  }
  async getBooking() {
    return { id: "b1", status: "pending_payment" as const, tutorId: "t1" };
  }
  async updateStatus() {}
  async createPaymentForBooking() {}
  async notify() {}
}

function request(overrides: Partial<CreateBookingRequest> = {}): CreateBookingRequest {
  return {
    tutorId: "t1",
    studentId: "stu1",
    customerUserId: "u-owner",
    subjectId: "s1",
    stageId: null,
    lessonTypeId: "lt1",
    method: "online",
    date: "2026-10-01",
    time: "17:00",
    durationMinutes: 60,
    idempotencyKey: "t1:2026-10-01:17:00:60:fixed",
    ...overrides,
  };
}

const deps = {
  rules: { maxAdvanceDays: 60, minLeadTimeHours: 0, allowedDurations: [60] },
  now: () => new Date("2026-09-20T10:00:00+03:00"),
  today: () => "2026-09-20",
  codeFactory: async () => "EDU-20092026-0001",
};

test("the same customer and key returns the same booking without inserting again", async () => {
  const store = new Store();
  const first = await createBookingRequest(store, deps, request());
  const second = await createBookingRequest(store, deps, request());
  assert.equal(first.id, second.id);
  assert.equal(store.inserted, 1);
});

test("another customer with the same key gets their own booking, never someone else's", async () => {
  const store = new Store();
  const victim = await createBookingRequest(store, deps, request());
  const attacker = await createBookingRequest(
    store,
    deps,
    request({ customerUserId: "u-attacker", studentId: "stu-attacker" }),
  );

  assert.notEqual(attacker.id, victim.id);
  assert.equal(store.inserted, 2, "a foreign key must create a new booking, not return the existing one");
});
