/**
 * Guardian-link enforcement (slice A+K).
 *
 * The engine decision is tested against an in-memory store mirroring the SQL
 * rules: a minor booked under strict enforcement needs a VERIFIED guardian
 * link held by the booking account; pending/revoked/missing links refuse.
 * The database layer of the same rule is the 0004 trigger (GD000) — verified
 * against production after migration, not here.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  BookingError,
  createBookingRequest,
  type BookingRow,
  type BookingStore,
  type CreateBookingRequest,
  type LessonTypeRow,
  type StudentRow,
  type TutorForBooking,
} from "@/lib/booking/engine";
import type { AvailabilityWindow } from "@/lib/booking/availability";
import type { BookingStatus } from "@/lib/booking/state";

class GuardianMemStore implements BookingStore {
  payments: string[] = [];
  notifications: { userId: string; type: string }[] = [];
  private seq = 0;

  constructor(
    private readonly tutor: TutorForBooking,
    private readonly student: StudentRow,
    /** studentId -> guardianUserId -> link status */
    private readonly links: Map<string, Map<string, "verified" | "pending" | "none">> = new Map(),
    private readonly windows: AvailabilityWindow[] = [{ weekday: 6, startTime: "09:00", endTime: "20:00" }],
  ) {}

  async getTutor() {
    return this.tutor;
  }
  async getStudent(id: string) {
    return id === this.student.id ? this.student : null;
  }
  async getGuardianVerification(studentId: string, guardianUserId: string) {
    return this.links.get(studentId)?.get(guardianUserId) ?? "none";
  }
  async getLessonType(id: string): Promise<LessonTypeRow | null> {
    return id === "lt-private" ? { id, defaultDuration: 60, priceMultiplier: "1.000", isActive: true } : null;
  }
  async getWindows() {
    return this.windows;
  }
  async getTimeOff() {
    return [];
  }
  async getBusy() {
    return [];
  }
  async insertBooking(input: { code: string; request: CreateBookingRequest; price: string; pricePerHour: string; status: BookingStatus }) {
    const row: BookingRow = { id: `b-${++this.seq}`, code: input.code, status: input.status, price: input.price };
    this.payments.push(row.id);
    return row;
  }
  async updateStatus() {}
  async createPaymentForBooking() {}
  async notify(userId: string, type: string) {
    this.notifications.push({ userId, type });
  }
}

const tutor: TutorForBooking = {
  id: "t-1",
  userId: "tu-1",
  status: "approved",
  pricePerHour: "5.000",
  teachesHome: true,
  teachesOnline: true,
  subscriptionActive: true,
  subjectIds: ["s-math"],
  stageIds: ["st-primary"],
};

const minor: StudentRow = { id: "st-minor", ownerUserId: "g-1", fullName: "طفل", stageId: "st-primary", isMinor: true };
const adult: StudentRow = { id: "st-adult", ownerUserId: "g-1", fullName: "بالغ", stageId: "st-secondary", isMinor: false };

const request = (studentId: string): CreateBookingRequest => ({
  tutorId: "t-1",
  studentId,
  customerUserId: "g-1",
  subjectId: "s-math",
  stageId: "st-primary",
  lessonTypeId: "lt-private",
  method: "online",
  date: "2026-10-10", // Saturday
  time: "10:00",
  durationMinutes: 60,
});

const deps = (strict: boolean) => ({
  rules: { maxAdvanceDays: 60, minLeadTimeHours: 0, allowedDurations: [30, 45, 60, 90, 120] },
  guardianEnforcementStrict: strict,
  now: () => new Date("2026-10-06T06:00:00Z"),
  today: () => "2026-10-06",
  codeFactory: async (day: string) => `EDU-${day.split("-").reverse().join("")}-0001`,
});

const link = (studentId: string, status: "verified" | "pending" | "none") =>
  new Map([[studentId, new Map([["g-1", status]])]]);

test("strict: a minor without any guardian link is refused with guardian_required", async () => {
  const s = new GuardianMemStore(tutor, minor);
  await assert.rejects(
    () => createBookingRequest(s, deps(true), request("st-minor")),
    (err: unknown) => err instanceof BookingError && err.code === "guardian_required",
  );
  assert.equal(s.payments.length, 0, "nothing may be written when the gate refuses");
});

test("strict: a minor with a VERIFIED link books successfully", async () => {
  const s = new GuardianMemStore(tutor, minor, link("st-minor", "verified"));
  const created = await createBookingRequest(s, deps(true), request("st-minor"));
  assert.equal(created.status, "pending_payment");
});

test("strict: a PENDING link is not enough", async () => {
  const s = new GuardianMemStore(tutor, minor, link("st-minor", "pending"));
  await assert.rejects(
    () => createBookingRequest(s, deps(true), request("st-minor")),
    (err: unknown) => err instanceof BookingError && err.code === "guardian_required",
  );
});

test("strict: a REVOKED link is not enough (maps to none)", async () => {
  const s = new GuardianMemStore(tutor, minor, link("st-minor", "none"));
  await assert.rejects(
    () => createBookingRequest(s, deps(true), request("st-minor")),
    (err: unknown) => err instanceof BookingError && err.code === "guardian_required",
  );
});

test("grace period (strict off): a minor without a link still books", async () => {
  const s = new GuardianMemStore(tutor, minor);
  const created = await createBookingRequest(s, deps(false), request("st-minor"));
  assert.equal(created.status, "pending_payment");
});

test("strict: an adult student does not need a guardian link", async () => {
  const s = new GuardianMemStore(tutor, adult);
  const created = await createBookingRequest(s, deps(true), request("st-adult"));
  assert.equal(created.status, "pending_payment");
});

test("guardian check never overrides ownership: a foreign student id stays student_not_owned", async () => {
  // The store only knows st-minor owned by g-1; g-2 books it — ownership fails
  // BEFORE the guardian gate runs, whatever the link table says.
  const foreign = { ...minor, ownerUserId: "g-1" };
  const s = new GuardianMemStore(tutor, foreign, link("st-minor", "verified"));
  const req = { ...request("st-minor"), customerUserId: "g-2" };
  await assert.rejects(
    () => createBookingRequest(s, deps(true), req),
    (err: unknown) => err instanceof BookingError && err.code === "student_not_owned",
  );
});
