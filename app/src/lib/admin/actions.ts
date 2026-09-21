/**
 * Audited admin mutations: tutors, tutor documents, users, bookings, payments
 * and subscriptions (§15, §38).
 *
 * Every function here:
 *   1. runs only after `requireAdminApi()` established the actor + permission,
 *   2. validates the target exists and that the CURRENT state allows the move,
 *   3. writes the row(s) and exactly one audit entry together,
 *   4. notifies the affected people,
 *   5. returns a small result the console can render.
 *
 * A status change never silently discards a reason: actions that restrict
 * someone's standing refuse to run without one (`requireReason`).
 */
import { query, queryOne, withTransaction, type TxClient } from "@/lib/db";
import { assertTransition } from "@/lib/booking/state";
import type { BookingStatus } from "@/lib/booking/state";
import { notifyMany, notifyUser } from "@/lib/notifications/service";
import type { PaymentStatus } from "@/lib/payments/service";
import { paymentProvider } from "@/lib/providers";
import { writeAudit, writeAuditTx } from "@/lib/security/audit";
import type { Permission } from "@/lib/security/rbac";
import { requiresReason } from "@/lib/security/rbac";
import { activateSubscription, getLatestSubscription } from "@/lib/subscriptions/service";
import type { AdminContext } from "./guard";

export class ActionError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "invalid_state"
      | "reason_required"
      | "invalid_transition"
      | "already_done"
      | "conflict",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ActionError";
  }
}

interface ActorMeta {
  actorUserId: string;
  actorLabel: string;
  ip: string | null;
  userAgent: string | null;
}

function auditBase(ctx: AdminContext): ActorMeta {
  return {
    actorUserId: ctx.actorUserId,
    actorLabel: ctx.actorLabel,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  };
}

// ---------------------------------------------------------------------------
// Tutors
// ---------------------------------------------------------------------------
export type TutorAction = "under_review" | "approve" | "reject" | "suspend" | "reactivate";

const TUTOR_TARGET_STATUS: Record<TutorAction, string> = {
  under_review: "under_review",
  approve: "approved",
  reject: "rejected",
  suspend: "suspended",
  reactivate: "approved",
};

export async function applyTutorAction(
  ctx: AdminContext,
  params: { tutorId: string; action: TutorAction; reason?: string | null },
): Promise<{ tutorId: string; status: string; userId: string }> {
  const requiredPermission: Permission =
    params.action === "reject" ? "tutor.reject" : params.action === "suspend" ? "tutor.suspend" : "tutor.approve";
  const reason = requireReason(requiredPermission, params.reason, params.action);

  const tutor = await queryOne<{ id: string; user_id: string; status: string; slug: string | null }>(
    `select id, user_id, status::text as status, slug from tutors where id = $1 and deleted_at is null`,
    [params.tutorId],
  );
  if (!tutor) throw new ActionError("not_found");

  const target = TUTOR_TARGET_STATUS[params.action];
  // "under_review" and "reactivate" are only meaningful from a decided state;
  // re-applying the same status is a no-op rather than an error, so a double
  // click from the console does not produce a scary failure.
  if (tutor.status === target && params.action !== "reactivate") {
    return { tutorId: tutor.id, status: tutor.status, userId: tutor.user_id };
  }

  const slug = tutor.slug ?? (target === "approved" ? await allocateSlug(tutor.id) : tutor.slug);

  const result = await withTransaction(async (tx: TxClient) => {
    await tx.query(
      `update tutors
          set status = $2::tutor_status,
              slug = $3,
              rejection_reason = case when $2 = 'rejected' then $4 else rejection_reason end,
              reviewed_at = case when $2 in ('approved','rejected','under_review','suspended') then now() else reviewed_at end,
              reviewed_by = $5,
              approved_at = case when $2 = 'approved' then coalesce(approved_at, now()) else approved_at end
        where id = $1`,
      [tutor.id, target, slug, reason, ctx.actorUserId],
    );
    await writeAuditTx(tx, {
      ...auditBase(ctx),
      action: `tutor.${params.action}`,
      entity: "tutors",
      entityId: tutor.id,
      reason,
      before: { status: tutor.status },
      after: { status: target },
    });
    return { tutorId: tutor.id, status: target, userId: tutor.user_id };
  });

  const notificationType =
    params.action === "approve" ? "tutor.approved" : params.action === "reject" ? "tutor.rejected" : params.action === "suspend" ? "tutor.suspended" : null;
  if (notificationType) {
    await notifyUser(tutor.user_id, notificationType, { reason: reason ?? "" }, { type: "tutor", id: tutor.id });
  }
  return result;
}

/** Public slug: derived from the tutor id, stable and never reused (§8 URLs). */
async function allocateSlug(tutorId: string): Promise<string> {
  const seed = tutorId.replace(/-/g, "").slice(0, 10);
  const taken = await queryOne<{ id: string }>(`select id from tutors where slug = $1`, [seed]);
  return taken ? `${seed}-${Math.floor(Math.random() * 900 + 100)}` : seed;
}

export async function updateTutorByAdmin(
  ctx: AdminContext,
  params: {
    tutorId: string;
    headlineAr?: string | null;
    headlineEn?: string | null;
    adminNotes?: string | null;
    pricePerHour?: string | null;
    teachesHome?: boolean;
    teachesOnline?: boolean;
  },
): Promise<void> {
  const before = await queryOne<{ admin_notes: string | null; price_per_hour: string }>(
    `select admin_notes, price_per_hour from tutors where id = $1 and deleted_at is null`,
    [params.tutorId],
  );
  if (!before) throw new ActionError("not_found");

  await withTransaction(async (tx: TxClient) => {
    await tx.query(
      `update tutors
          set headline_ar = coalesce($2, headline_ar),
              headline_en = coalesce($3, headline_en),
              admin_notes = coalesce($4, admin_notes),
              price_per_hour = coalesce($5::numeric, price_per_hour),
              teaches_home = coalesce($6, teaches_home),
              teaches_online = coalesce($7, teaches_online)
        where id = $1`,
      [
        params.tutorId,
        params.headlineAr ?? null,
        params.headlineEn ?? null,
        params.adminNotes ?? null,
        params.pricePerHour ?? null,
        params.teachesHome ?? null,
        params.teachesOnline ?? null,
      ],
    );
    await writeAuditTx(tx, {
      ...auditBase(ctx),
      action: "tutor.edit",
      entity: "tutors",
      entityId: params.tutorId,
      before: { admin_notes: before.admin_notes, price_per_hour: before.price_per_hour },
      after: {
        admin_notes: params.adminNotes ?? before.admin_notes,
        price_per_hour: params.pricePerHour ?? before.price_per_hour,
      },
    });
  });
}

export async function decideTutorDocument(
  ctx: AdminContext,
  params: { documentId: string; decision: "approved" | "rejected"; reason?: string | null },
): Promise<{ tutorId: string; tutorUserId: string }> {
  const reason = params.decision === "rejected" ? requireReason("tutor.edit", params.reason, "reject document") : null;
  const document = await queryOne<{ id: string; tutor_id: string; user_id: string }>(
    `select d.id, d.tutor_id, t.user_id
       from tutor_documents d join tutors t on t.id = d.tutor_id
      where d.id = $1`,
    [params.documentId],
  );
  if (!document) throw new ActionError("not_found");

  await withTransaction(async (tx: TxClient) => {
    await tx.query(
      `update tutor_documents set status = $2::document_status, reviewed_by = $3, reviewed_at = now() where id = $1`,
      [document.id, params.decision, ctx.actorUserId],
    );
    await writeAuditTx(tx, {
      ...auditBase(ctx),
      action: `tutor.document.${params.decision}`,
      entity: "tutor_documents",
      entityId: document.id,
      reason,
      after: { tutor_id: document.tutor_id },
    });
  });

  if (params.decision === "rejected") {
    await notifyUser(document.user_id, "tutor.documents_rejected", { reason: reason ?? "" }, {
      type: "tutor",
      id: document.tutor_id,
    });
  }
  return { tutorId: document.tutor_id, tutorUserId: document.user_id };
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------
export async function activateTutorSubscription(
  ctx: AdminContext,
  params: { tutorId: string; planId: string; subscriptionId?: string | null; recordPayment?: { amount: string; reference?: string | null } },
): Promise<{ startsAt: Date; expiresAt: Date }> {
  const tutor = await queryOne<{ id: string; user_id: string }>(`select id, user_id from tutors where id = $1`, [
    params.tutorId,
  ]);
  if (!tutor) throw new ActionError("not_found");

  const window = await withTransaction(async (tx: TxClient) => {
    const activated = await activateSubscription({
      tx,
      tutorId: params.tutorId,
      planId: params.planId,
      subscriptionId: params.subscriptionId ?? null,
    });
    if (params.recordPayment) {
      // A subscription paid outside the platform (cash, transfer) is recorded
      // as a verified payment with the admin as verifier - the audit row names
      // the human who confirmed the money arrived.
      await tx.query(
        `insert into payments (reference_code, subject_type, subscription_id, amount, method, status, verified_by, verified_at)
         select $1, 'subscription', s.id, $2::numeric, 'benefitpay', 'verified', $3, now()
           from subscriptions s where s.tutor_id = $4 order by s.created_at desc limit 1`,
        [
          params.recordPayment.reference?.trim() || `SUB-MANUAL-${Date.now().toString(36).toUpperCase()}`,
          params.recordPayment.amount,
          ctx.actorUserId,
          params.tutorId,
        ],
      );
    }
    await writeAuditTx(tx, {
      ...auditBase(ctx),
      action: "subscription.activate",
      entity: "tutors",
      entityId: params.tutorId,
      after: { plan_id: params.planId, starts_at: activated.startsAt, expires_at: activated.expiresAt },
    });
    return activated;
  });

  await notifyUser(
    tutor.user_id,
    "subscription.activated",
    { until: window.expiresAt.toISOString().slice(0, 10) },
    { type: "tutor", id: tutor.id },
  );
  return { startsAt: window.startsAt, expiresAt: window.expiresAt };
}

export async function cancelTutorSubscription(
  ctx: AdminContext,
  params: { tutorId: string; reason?: string | null },
): Promise<void> {
  const reason = requireReason("subscription.manage", params.reason, "cancel subscription");
  const subscription = await getLatestSubscription(params.tutorId);
  if (!subscription) throw new ActionError("not_found");
  await withTransaction(async (tx: TxClient) => {
    await tx.query(`update subscriptions set status = 'cancelled' where id = $1`, [subscription.id]);
    await tx.query(`update tutors set status = 'expired_subscription' where id = $1 and status = 'approved'`, [
      params.tutorId,
    ]);
    await writeAuditTx(tx, {
      ...auditBase(ctx),
      action: "subscription.cancel",
      entity: "subscriptions",
      entityId: subscription.id,
      reason,
      before: { status: subscription.status },
      after: { status: "cancelled" },
    });
  });
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export type UserAction = "restrict" | "suspend" | "reactivate";

const USER_STATUS: Record<UserAction, string> = {
  restrict: "restricted",
  suspend: "suspended",
  reactivate: "active",
};

export async function applyUserAction(
  ctx: AdminContext,
  params: { userId: string; action: UserAction; reason?: string | null },
): Promise<{ userId: string; status: string; sessionsRevoked: number }> {
  const permission: Permission = params.action === "restrict" ? "user.restrict" : "user.ban";
  const reason = requireReason(permission, params.reason, params.action);

  const user = await queryOne<{ id: string; status: string; primary_role: string }>(
    `select id, status::text as status, primary_role::text as primary_role from users where id = $1 and deleted_at is null`,
    [params.userId],
  );
  if (!user) throw new ActionError("not_found");
  // An admin account cannot be locked out of the platform by the console: the
  // way to remove an admin is to remove the role, which is audited separately.
  if (user.primary_role === "admin" && params.action !== "reactivate") {
    throw new ActionError("invalid_state", "admin accounts are managed through roles");
  }

  const status = USER_STATUS[params.action];
  const sessionsRevoked = await withTransaction(async (tx: TxClient) => {
    await tx.query(`update users set status = $2::user_status where id = $1`, [user.id, status]);
    // A suspended account keeps no live session: the cookie would otherwise
    // remain valid until it expired.
    const revoked = await tx.query<{ id: string }>(
      `update sessions set revoked_at = now() where user_id = $1 and revoked_at is null returning id`,
      [user.id],
    );
    await writeAuditTx(tx, {
      ...auditBase(ctx),
      action: `user.${params.action}`,
      entity: "users",
      entityId: user.id,
      reason,
      before: { status: user.status },
      after: { status },
    });
    return revoked.length;
  });

  return { userId: user.id, status, sessionsRevoked };
}

export async function assignUserRole(
  ctx: AdminContext,
  params: { userId: string; roleCode: string; grant: boolean },
): Promise<{ roles: string[] }> {
  const role = await queryOne<{ id: string; code: string }>(`select id, code from roles where code = $1`, [
    params.roleCode,
  ]);
  if (!role) throw new ActionError("not_found");
  const user = await queryOne<{ id: string }>(`select id from users where id = $1 and deleted_at is null`, [
    params.userId,
  ]);
  if (!user) throw new ActionError("not_found");

  await withTransaction(async (tx: TxClient) => {
    if (params.grant) {
      await tx.query(
        `insert into user_roles (user_id, role_id, granted_by) values ($1, $2, $3)
         on conflict (user_id, role_id) do nothing`,
        [user.id, role.id, ctx.actorUserId],
      );
    } else {
      await tx.query(`delete from user_roles where user_id = $1 and role_id = $2`, [user.id, role.id]);
    }
    await writeAuditTx(tx, {
      ...auditBase(ctx),
      action: params.grant ? "role.grant" : "role.revoke",
      entity: "users",
      entityId: user.id,
      after: { role: role.code },
    });
  });

  const roles = await query<{ code: string }>(
    `select r.code from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = $1 order by r.code`,
    [user.id],
  );
  return { roles: roles.map((r) => r.code) };
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------
const STATUS_NOTIFICATION: Partial<Record<BookingStatus, string>> = {
  confirmed: "booking.confirmed",
  cancelled: "booking.cancelled",
  rejected: "booking.rejected",
  tutor_accepted: "booking.tutor_accepted",
  scheduled: "booking.scheduled",
  completed: "booking.completed",
};

export async function setBookingStatus(
  ctx: AdminContext,
  params: { bookingId: string; to: BookingStatus; reason?: string | null },
): Promise<{ bookingId: string; status: BookingStatus }> {
  const permission: Permission = params.to === "cancelled" ? "booking.cancel" : "booking.update";
  const reason = requireReason(permission, params.reason, params.to);

  const booking = await queryOne<{
    id: string;
    code: string;
    status: BookingStatus;
    customer_user_id: string;
    tutor_user_id: string;
  }>(
    `select b.id, b.code, b.status, b.customer_user_id, t.user_id as tutor_user_id
       from bookings b join tutors t on t.id = b.tutor_id
      where b.id = $1`,
    [params.bookingId],
  );
  if (!booking) throw new ActionError("not_found");

  // Legality first, in memory: the pure state machine is the single definition
  // of which moves exist, and the same function guards the customer and tutor
  // paths.
  try {
    assertTransition(booking.status, params.to, "admin");
  } catch {
    throw new ActionError("invalid_transition", `${booking.status} -> ${params.to}`);
  }

  await withTransaction(async (tx: TxClient) => {
    await tx.query(
      `update bookings
          set status = $2::booking_status,
              cancelled_at = case when $2 in ('cancelled','rejected') then now() else cancelled_at end,
              cancelled_by = case when $2 in ('cancelled','rejected') then $3 else cancelled_by end,
              cancel_reason = case when $2 in ('cancelled','rejected') then $4 else cancel_reason end,
              confirmed_at = case when $2 = 'confirmed' then now() else confirmed_at end,
              completed_at = case when $2 = 'completed' then now() else completed_at end
        where id = $1`,
      [booking.id, params.to, ctx.actorUserId, reason],
    );
    await writeAuditTx(tx, {
      ...auditBase(ctx),
      action: "booking.status_change",
      entity: "bookings",
      entityId: booking.id,
      reason,
      before: { status: booking.status },
      after: { status: params.to },
    });
  });

  const type = STATUS_NOTIFICATION[params.to];
  if (type) {
    await notifyMany([booking.customer_user_id, booking.tutor_user_id], type, {
      code: booking.code,
      reason: reason ?? "",
    }, { type: "booking", id: booking.id });
  }
  return { bookingId: booking.id, status: params.to };
}

export async function setBookingZoomLink(
  ctx: AdminContext,
  params: { bookingId: string; zoomUrl: string | null },
): Promise<void> {
  const booking = await queryOne<{ id: string; zoom_url: string | null; customer_user_id: string }>(
    `select id, zoom_url, customer_user_id from bookings where id = $1`,
    [params.bookingId],
  );
  if (!booking) throw new ActionError("not_found");
  await withTransaction(async (tx: TxClient) => {
    await tx.query(`update bookings set zoom_url = $2 where id = $1`, [booking.id, params.zoomUrl]);
    await writeAuditTx(tx, {
      ...auditBase(ctx),
      action: "booking.zoom_link",
      entity: "bookings",
      entityId: booking.id,
      before: { zoom_url: booking.zoom_url },
      after: { zoom_url: params.zoomUrl },
    });
  });
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
export async function verifyPayment(
  ctx: AdminContext,
  params: { paymentId: string; reference?: string | null },
): Promise<{ paymentId: string; bookingStatus: BookingStatus | null }> {
  const payment = await queryOne<{
    id: string;
    status: PaymentStatus;
    subject_type: "booking" | "subscription";
    booking_id: string | null;
    subscription_id: string | null;
    amount: string;
    reference_code: string;
  }>(
    `select id, status, subject_type, booking_id, subscription_id, amount, reference_code
       from payments where id = $1`,
    [params.paymentId],
  );
  if (!payment) throw new ActionError("not_found");
  if (payment.status === "refunded") throw new ActionError("invalid_state");

  // Verifying is IDEMPOTENT rather than refused when it is already recorded.
  // The booking/subscription follow-up runs in its own transaction, so if it
  // failed the operator must be able to press the same button again - an
  // "already done" error would leave the payment verified and the booking
  // stranded with no way forward.
  if (payment.status !== "verified") {
    await paymentProvider().confirmManually(payment.id, ctx.actorUserId, params.reference ?? undefined);
  }

  let bookingStatus: BookingStatus | null = null;

  if (payment.subject_type === "booking" && payment.booking_id) {
    const booking = await queryOne<{ status: BookingStatus; code: string; customer_user_id: string; tutor_user_id: string }>(
      `select b.status, b.code, b.customer_user_id, t.user_id as tutor_user_id
         from bookings b join tutors t on t.id = b.tutor_id where b.id = $1`,
      [payment.booking_id],
    );
    if (booking) {
      // A verified payment moves the booking to `paid`. The intermediate
      // `payment_verification` step is recorded too, so the timeline shows how
      // it got there instead of jumping.
      if (booking.status === "pending_payment") {
        await setBookingStatus(ctx, { bookingId: payment.booking_id, to: "payment_verification", reason: "payment_submitted" });
      }
      const moved = await setBookingStatus(ctx, {
        bookingId: payment.booking_id,
        to: "paid",
        reason: "payment_verified",
      });
      bookingStatus = moved.status;
      await notifyUser(
        booking.customer_user_id,
        "payment.verified",
        { code: payment.reference_code },
        { type: "payment", id: payment.id },
      );
    }
  } else if (payment.subject_type === "subscription" && payment.subscription_id) {
    const subscription = await queryOne<{ tutor_id: string; plan_id: string; user_id: string }>(
      `select s.tutor_id, s.plan_id, t.user_id
         from subscriptions s join tutors t on t.id = s.tutor_id
        where s.id = $1`,
      [payment.subscription_id],
    );
    if (subscription) {
      await activateSubscription({
        tutorId: subscription.tutor_id,
        planId: subscription.plan_id,
        subscriptionId: payment.subscription_id,
      });
      await notifyUser(
        subscription.user_id,
        "subscription.activated",
        {},
        { type: "subscription", id: payment.subscription_id },
      );
    }
  }

  await writeAudit({
    ...auditBase(ctx),
    action: "payment.verified",
    entity: "payments",
    entityId: payment.id,
    after: { reference_code: payment.reference_code, amount: payment.amount, customer_reference: params.reference ?? null },
  });

  return { paymentId: payment.id, bookingStatus };
}

export async function rejectPayment(
  ctx: AdminContext,
  params: { paymentId: string; reason?: string | null },
): Promise<{ paymentId: string }> {
  const reason = requireReason("payment.verify", params.reason, "reject payment");
  const payment = await queryOne<{ id: string; status: PaymentStatus; booking_id: string | null; subject_type: string }>(
    `select id, status, booking_id, subject_type from payments where id = $1`,
    [params.paymentId],
  );
  if (!payment) throw new ActionError("not_found");
  if (payment.status === "verified") throw new ActionError("invalid_state");

  await withTransaction(async (tx: TxClient) => {
    await tx.query(`update payments set status = 'rejected', rejection_reason = $2 where id = $1`, [
      payment.id,
      reason,
    ]);
    await writeAuditTx(tx, {
      ...auditBase(ctx),
      action: "payment.rejected",
      entity: "payments",
      entityId: payment.id,
      reason,
      before: { status: payment.status },
      after: { status: "rejected" },
    });
  });

  if (payment.subject_type === "booking" && payment.booking_id) {
    // The customer can retry, so the booking returns to the state where a new
    // proof makes sense - but only if it is still in verification.
    const booking = await queryOne<{ status: BookingStatus; customer_user_id: string; code: string }>(
      `select status, customer_user_id, code from bookings where id = $1`,
      [payment.booking_id],
    );
    if (booking?.status === "payment_verification") {
      await setBookingStatus(ctx, {
        bookingId: payment.booking_id,
        to: "pending_payment",
        reason: `payment_rejected: ${reason}`,
      });
    }
    if (booking) {
      await notifyUser(booking.customer_user_id, "payment.rejected", { reason, code: booking.code }, {
        type: "payment",
        id: payment.id,
      });
    }
  }
  return { paymentId: payment.id };
}

export async function refundPayment(
  ctx: AdminContext,
  params: { paymentId: string; reason?: string | null },
): Promise<{ paymentId: string }> {
  const reason = requireReason("payment.refund", params.reason, "refund payment");
  const payment = await queryOne<{ id: string; status: PaymentStatus; booking_id: string | null }>(
    `select id, status, booking_id from payments where id = $1`,
    [params.paymentId],
  );
  if (!payment) throw new ActionError("not_found");
  if (payment.status !== "verified") {
    // Refunding money the platform never confirmed receiving is a data error,
    // not a workflow step.
    throw new ActionError("invalid_state");
  }

  await paymentProvider().refundManually(payment.id, ctx.actorUserId, reason ?? "manual refund");
  await writeAudit({
    ...auditBase(ctx),
    action: "payment.refunded",
    entity: "payments",
    entityId: payment.id,
    reason,
    before: { status: payment.status },
    after: { status: "refunded" },
  });

  if (payment.booking_id) {
    const booking = await queryOne<{ status: BookingStatus; customer_user_id: string; code: string }>(
      `select status, customer_user_id, code from bookings where id = $1`,
      [payment.booking_id],
    );
    if (booking) {
      const target: BookingStatus | null =
        booking.status === "refund_requested"
          ? "refunded"
          : booking.status === "completed" || booking.status === "paid" || booking.status === "confirmed" || booking.status === "tutor_accepted" || booking.status === "scheduled"
            ? "cancelled"
            : null;
      if (target) {
        await setBookingStatus(ctx, { bookingId: payment.booking_id, to: target, reason: reason ?? "refunded" });
      }
      await notifyUser(booking.customer_user_id, "payment.refunded", { code: booking.code }, {
        type: "payment",
        id: payment.id,
      });
    }
  }
  return { paymentId: payment.id };
}

/** Enforce the reason rule against the permission's own requirement. */
function requireReason(permission: Permission, reason: unknown, action: string): string | null {
  if (!requiresReason(permission)) {
    return typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : null;
  }
  if (typeof reason !== "string" || reason.trim().length < 3) {
    throw new ActionError("reason_required", action);
  }
  return reason.trim().slice(0, 500);
}
