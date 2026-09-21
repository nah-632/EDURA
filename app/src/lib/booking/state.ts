/**
 * Booking state machine. Transitions are declared here once and enforced on
 * the server for every path (customer, tutor, admin, scheduled job) - no code
 * path may set a status that is not a legal edge below.
 */
export const bookingStatuses = [
  "pending_payment",
  "payment_verification",
  "paid",
  "confirmed",
  "tutor_accepted",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
  "rejected",
  "refund_requested",
  "refunded",
] as const;

export type BookingStatus = (typeof bookingStatuses)[number];

export type Actor = "customer" | "tutor" | "admin" | "system";

/** Legal edges: from -> (to -> who may perform it). */
export const transitions: Record<BookingStatus, Partial<Record<BookingStatus, Actor[]>>> = {
  pending_payment: {
    payment_verification: ["customer", "admin"],
    cancelled: ["customer", "admin", "system"],
    rejected: ["admin"],
  },
  payment_verification: {
    paid: ["admin"],
    pending_payment: ["admin"], // proof rejected -> customer may retry
    cancelled: ["customer", "admin"],
    rejected: ["admin"],
  },
  paid: {
    confirmed: ["admin"],
    cancelled: ["customer", "admin"],
    refund_requested: ["customer", "admin"],
  },
  confirmed: {
    tutor_accepted: ["tutor", "admin"],
    cancelled: ["customer", "admin"],
    rejected: ["tutor", "admin"],
    refund_requested: ["customer", "admin"],
  },
  tutor_accepted: {
    scheduled: ["tutor", "admin"],
    cancelled: ["customer", "admin"],
    rejected: ["tutor", "admin"],
    refund_requested: ["customer", "admin"],
  },
  scheduled: {
    in_progress: ["tutor", "admin", "system"],
    completed: ["tutor", "admin", "system"],
    cancelled: ["customer", "admin"],
    refund_requested: ["customer", "admin"],
  },
  in_progress: {
    completed: ["tutor", "admin", "system"],
    cancelled: ["admin"],
  },
  completed: {
    refund_requested: ["customer", "admin"],
  },
  refund_requested: {
    refunded: ["admin"],
    completed: ["admin"], // request declined
    cancelled: ["admin"],
  },
  refunded: {},
  cancelled: {},
  rejected: {},
};

/**
 * Statuses that hold the tutor's slot. Kept in sync with the partial predicate
 * of the `bookings_no_tutor_overlap` exclusion constraint in 0000_init.sql -
 * if you change one, change both, and the SQL test asserts the same list.
 */
export const slotHoldingStatuses: BookingStatus[] = [
  "pending_payment",
  "payment_verification",
  "paid",
  "confirmed",
  "tutor_accepted",
  "scheduled",
  "in_progress",
];

export function holdsSlot(status: BookingStatus): boolean {
  return slotHoldingStatuses.includes(status);
}

export function canTransition(from: BookingStatus, to: BookingStatus, actor: Actor): boolean {
  if (from === to) return false;
  return Boolean(transitions[from][to]?.includes(actor));
}

export function allowedTransitions(from: BookingStatus, actor: Actor): BookingStatus[] {
  return (Object.keys(transitions[from]) as BookingStatus[]).filter((to) =>
    canTransition(from, to, actor),
  );
}

export class TransitionError extends Error {
  constructor(
    readonly from: BookingStatus,
    readonly to: BookingStatus,
    readonly actor: Actor,
  ) {
    super(`illegal transition ${from} -> ${to} by ${actor}`);
    this.name = "TransitionError";
  }
}

export function assertTransition(from: BookingStatus, to: BookingStatus, actor: Actor): void {
  if (!canTransition(from, to, actor)) throw new TransitionError(from, to, actor);
}

/** Terminal states never change again. */
export function isTerminal(status: BookingStatus): boolean {
  return Object.keys(transitions[status]).length === 0;
}

/** Lesson is still ahead of the customer (used by dashboards and reminders). */
export function isUpcoming(status: BookingStatus): boolean {
  return holdsSlot(status);
}

/** Reviews are only possible from a completed booking (§19). */
export function canReview(status: BookingStatus): boolean {
  return status === "completed";
}
