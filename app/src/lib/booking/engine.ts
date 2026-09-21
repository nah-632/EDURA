/**
 * Booking engine.
 *
 * All persistence goes through the `BookingStore` interface so the decision
 * logic (pricing, availability, state transitions, conflict handling) can be
 * tested deterministically and can never be reimplemented per caller. The
 * production store is a thin SQL adapter; the tests use an in-memory store.
 *
 * The database remains the final authority on conflicts: the store surfaces
 * the exclusion-constraint violation as `SlotTakenError` and this module turns
 * it into a domain result instead of a 500.
 */
import { checkAvailability, type AvailabilityWindow, type BookingRules } from "./availability";
import { formatBookingCode } from "./code";
import { fromMillimes, priceBreakdown, toMillimes } from "./pricing";
import { assertTransition, type Actor, type BookingStatus } from "./state";
import type { TutorStatus } from "@/lib/tutor/status";

export class SlotTakenError extends Error {
  constructor() {
    super("slot_taken");
    this.name = "SlotTakenError";
  }
}

export class BookingError extends Error {
  constructor(
    readonly code:
      | "tutor_not_found"
      | "tutor_not_bookable"
      | "subject_not_offered"
      | "stage_not_offered"
      | "method_not_offered"
      | "lesson_type_not_found"
      | "student_not_owned"
      | "availability"
      | "invalid_transition"
      | "duplicate_request",
    message?: string,
    readonly detail?: string,
  ) {
    super(message ?? code);
    this.name = "BookingError";
  }
}

export interface TutorForBooking {
  id: string;
  userId: string;
  /** TutorStatus: the engine only ever accepts "approved" (see createBookingRequest). */
  status: TutorStatus;
  pricePerHour: string;
  teachesHome: boolean;
  teachesOnline: boolean;
  subscriptionActive: boolean;
  subjectIds: string[];
  stageIds: string[];
  subjectPriceOverride?: string | null;
}

export interface LessonTypeRow {
  id: string;
  defaultDuration: number;
  priceMultiplier: string;
  isActive: boolean;
}

export interface StudentRow {
  id: string;
  ownerUserId: string;
  fullName: string;
  stageId: string | null;
}

export interface CreateBookingRequest {
  tutorId: string;
  studentId: string;
  customerUserId: string;
  subjectId: string;
  stageId: string | null;
  lessonTypeId: string;
  method: "home" | "online";
  date: string;
  time: string;
  durationMinutes: number;
  areaId?: string | null;
  addressNote?: string | null;
  customerNotes?: string | null;
  idempotencyKey?: string | null;
}

export interface BookingRow {
  id: string;
  code: string;
  status: BookingStatus;
  price: string;
}

export interface BookingStore {
  getTutor(tutorId: string): Promise<TutorForBooking | null>;
  getStudent(studentId: string): Promise<StudentRow | null>;
  getLessonType(lessonTypeId: string): Promise<LessonTypeRow | null>;
  getWindows(tutorId: string): Promise<AvailabilityWindow[]>;
  getTimeOff(tutorId: string, fromDate: string, toDate: string): Promise<{ startsAt: Date; endsAt: Date }[]>;
  getBusy(tutorId: string, fromDate: string, toDate: string): Promise<{ startsAt: Date; endsAt: Date; status: BookingStatus }[]>;
  /** Must allocate the code and insert the booking in one transaction. */
  insertBooking(input: {
    code: string;
    request: CreateBookingRequest;
    price: string;
    pricePerHour: string;
    status: BookingStatus;
  }): Promise<BookingRow>;
  /**
   * Scoped by the requesting customer on purpose: an idempotency key that only
   * matched by value would let anyone who can guess a key (they contain the
   * tutor, date and time) read somebody else's booking back out of the API.
   */
  findByIdempotencyKey?(key: string, customerUserId: string): Promise<BookingRow | null>;
  getBooking(bookingId: string): Promise<{ id: string; status: BookingStatus; tutorId: string } | null>;
  updateStatus(bookingId: string, to: BookingStatus, actorUserId: string | null, reason: string | null): Promise<void>;
  createPaymentForBooking(bookingId: string, amount: string, code: string): Promise<void>;
  notify(userId: string, type: string, params: Record<string, unknown>, entityId?: string): Promise<void>;
}

export interface EngineDeps {
  rules: BookingRules;
  now(): Date;
  /** Asia/Bahrain date used for the booking-code day component */
  today(): string;
  codeFactory(day: string): Promise<string>;
}

export interface CreatedBooking {
  id: string;
  code: string;
  status: BookingStatus;
  amount: string;
  hourlyRate: string;
  durationMinutes: number;
}

/**
 * Create a booking request.
 *
 * Order of operations matters: everything cheap and deterministic is checked
 * before anything is written, and the write itself is a single store call so
 * the code allocation, the booking row and the payment row cannot come apart.
 */
export async function createBookingRequest(
  store: BookingStore,
  deps: EngineDeps,
  request: CreateBookingRequest,
): Promise<CreatedBooking> {
  if (request.idempotencyKey && store.findByIdempotencyKey) {
    const existing = await store.findByIdempotencyKey(request.idempotencyKey, request.customerUserId);
    if (existing) {
      return {
        id: existing.id,
        code: existing.code,
        status: existing.status,
        amount: existing.price,
        hourlyRate: existing.price,
        durationMinutes: request.durationMinutes,
      };
    }
  }

  const tutor = await store.getTutor(request.tutorId);
  if (!tutor) throw new BookingError("tutor_not_found");
  if (tutor.status !== "approved" || !tutor.subscriptionActive) {
    throw new BookingError("tutor_not_bookable");
  }
  if (!tutor.subjectIds.includes(request.subjectId)) {
    throw new BookingError("subject_not_offered");
  }
  if (request.stageId && !tutor.stageIds.includes(request.stageId)) {
    throw new BookingError("stage_not_offered");
  }
  if (request.method === "home" && !tutor.teachesHome) throw new BookingError("method_not_offered");
  if (request.method === "online" && !tutor.teachesOnline) throw new BookingError("method_not_offered");

  const lessonType = await store.getLessonType(request.lessonTypeId);
  if (!lessonType || !lessonType.isActive) throw new BookingError("lesson_type_not_found");

  const student = await store.getStudent(request.studentId);
  // The student must belong to the signed-in account: an id from the request
  // body is never trusted on its own.
  if (!student || student.ownerUserId !== request.customerUserId) {
    throw new BookingError("student_not_owned");
  }

  const hourly = tutor.subjectPriceOverride ?? tutor.pricePerHour;
  const breakdown = priceBreakdown(hourly, request.durationMinutes, lessonType.priceMultiplier);

  const fromDate = request.date;
  const [windows, timeOff, busy] = await Promise.all([
    store.getWindows(tutor.id),
    store.getTimeOff(tutor.id, fromDate, fromDate),
    store.getBusy(tutor.id, fromDate, fromDate),
  ]);

  const availability = checkAvailability({
    date: request.date,
    time: request.time,
    durationMinutes: request.durationMinutes,
    windows,
    timeOff,
    busy,
    rules: deps.rules,
    now: deps.now(),
  });
  if (!availability.ok) {
    throw new BookingError("availability", "slot unavailable", availability.code);
  }

  const code = await deps.codeFactory(deps.today());
  let booking: BookingRow;
  try {
    booking = await store.insertBooking({
      code,
      request,
      price: breakdown.total,
      pricePerHour: breakdown.hourly,
      status: "pending_payment",
    });
  } catch (err) {
    // The exclusion constraint fired: two requests raced for the same slot.
    if (err instanceof SlotTakenError) throw err;
    throw err;
  }

  await store.createPaymentForBooking(booking.id, booking.price, booking.code);
  await store.notify(tutor.userId, "booking.new_request", { code: booking.code }, booking.id);
  await store.notify(request.customerUserId, "booking.created", { code: booking.code }, booking.id);

  return {
    id: booking.id,
    code: booking.code,
    status: booking.status,
    amount: booking.price,
    hourlyRate: breakdown.hourly,
    durationMinutes: request.durationMinutes,
  };
}

export interface StatusChange {
  bookingId: string;
  to: BookingStatus;
  actor: Actor;
  actorUserId: string | null;
  reason?: string | null;
}

/** Apply a status change, refusing anything that is not a declared edge. */
export async function transitionBooking(store: BookingStore, change: StatusChange): Promise<void> {
  const booking = await store.getBooking(change.bookingId);
  if (!booking) throw new BookingError("invalid_transition", "booking not found");
  assertTransition(booking.status, change.to, change.actor);
  await store.updateStatus(
    change.bookingId,
    change.to,
    change.actorUserId,
    change.reason?.trim() || null,
  );
}

/**
 * Effect of a verified payment on the booking. Kept here (not in the route) so
 * the payment -> booking coupling is expressed once.
 */
export async function applyVerifiedPayment(
  store: BookingStore,
  bookingId: string,
  adminUserId: string,
): Promise<void> {
  const booking = await store.getBooking(bookingId);
  if (!booking) throw new BookingError("invalid_transition", "booking not found");
  if (booking.status === "pending_payment") {
    await transitionBooking(store, {
      bookingId,
      to: "payment_verification",
      actor: "admin",
      actorUserId: adminUserId,
      reason: "payment_submitted",
    });
  }
  await transitionBooking(store, {
    bookingId,
    to: "paid",
    actor: "admin",
    actorUserId: adminUserId,
    reason: "payment_verified",
  });
}

export function amountFromMilli(milli: number): string {
  return fromMillimes(milli);
}

export { toMillimes };
