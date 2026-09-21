/**
 * Subscription rules (§37).
 *
 * v1 takes no automatic payment: an admin records a manual BenefitPay payment
 * and activates the subscription. These functions own the arithmetic of when a
 * subscription starts, when it expires, and how long the grace period keeps a
 * tutor listed - the same predicate the `public_tutors` view encodes, expressed
 * again here so the tutor dashboard and the search page can never disagree.
 */
export const DAY_MS = 86_400_000;

export type SubscriptionStatus = "pending" | "active" | "expired" | "cancelled";
export type SubscriptionPhase = "pending" | "active" | "grace" | "expired" | "cancelled";

export interface PlanShape {
  durationDays: number;
  graceDays: number;
}

export interface SubscriptionShape {
  status: SubscriptionStatus;
  startsAt: Date | null;
  expiresAt: Date | null;
  graceUntil: Date | null;
}

export interface ActivationWindow {
  startsAt: Date;
  expiresAt: Date;
  graceUntil: Date;
  /** true when the new period was appended to an existing one, not started fresh */
  renewed: boolean;
}

/**
 * Where a new period begins.
 *
 * A renewal extends the CURRENT period instead of starting from today: a tutor
 * who pays three days before expiry must not lose those three days. An expired
 * or cancelled subscription starts from now.
 */
export function computeActivation(
  plan: PlanShape,
  now: Date,
  current?: SubscriptionShape | null,
): ActivationWindow {
  const renewableUntil =
    current && current.status === "active" && current.expiresAt && current.expiresAt.getTime() > now.getTime()
      ? current.expiresAt
      : null;
  const startsAt = renewableUntil ?? now;
  const expiresAt = new Date(startsAt.getTime() + plan.durationDays * DAY_MS);
  const graceUntil = new Date(expiresAt.getTime() + plan.graceDays * DAY_MS);
  return { startsAt, expiresAt, graceUntil, renewed: Boolean(renewableUntil) };
}

/**
 * Phase of a subscription at an instant.
 *
 * `grace` is a real state, not a rounding: the tutor stays listed while inside
 * it, which is why the public view compares against `coalesce(grace_until,
 * expires_at)` rather than `expires_at`.
 */
export function subscriptionPhase(sub: SubscriptionShape | null, now: Date): SubscriptionPhase {
  if (!sub) return "expired";
  if (sub.status === "pending") return "pending";
  if (sub.status === "cancelled") return "cancelled";
  if (sub.status === "expired") return "expired";
  const hardEnd = sub.graceUntil ?? sub.expiresAt;
  if (!hardEnd) return "expired";
  if (hardEnd.getTime() <= now.getTime()) return "expired";
  if (sub.expiresAt && sub.expiresAt.getTime() <= now.getTime()) return "grace";
  return "active";
}

/** Phases in which the tutor is visible in search and can receive bookings. */
export function isListable(phase: SubscriptionPhase): boolean {
  return phase === "active" || phase === "grace";
}

export function daysRemaining(sub: SubscriptionShape | null, now: Date): number {
  const end = sub?.graceUntil ?? sub?.expiresAt ?? null;
  if (!end) return 0;
  const ms = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / DAY_MS));
}

/**
 * Expiry warning. Sent once per day at most (the job runs hourly and would
 * otherwise repeat it), and never for a subscription that is already in grace -
 * at that point the tutor has been told, and the message that matters is
 * "renew to reappear", not another countdown.
 */
export function shouldWarnExpiry(params: {
  phase: SubscriptionPhase;
  daysLeft: number;
  lastWarnedAt: Date | null;
  now: Date;
  withinDays?: number;
}): boolean {
  const within = params.withinDays ?? 7;
  if (params.phase !== "active") return false;
  if (params.daysLeft > within) return false;
  if (!params.lastWarnedAt) return true;
  return params.now.getTime() - params.lastWarnedAt.getTime() >= DAY_MS;
}

/** New subscriptions a tutor is allowed to request (one open request at a time). */
export function canRequestRenewal(sub: SubscriptionShape | null): boolean {
  return !sub || sub.status !== "pending";
}
