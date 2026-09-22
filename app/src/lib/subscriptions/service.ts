/**
 * Subscription service (§37).
 *
 * v1 is intentionally manual: a tutor REQUESTS a plan, the platform issues a
 * pending subscription plus a payment record, the tutor pays by BenefitPay and
 * an admin verifies it - which is what actually activates the subscription.
 * There is no automated billing anywhere, and nothing here pretends otherwise:
 * `requestPlan` writes a pending row and stops.
 */
import { query, queryOne, withTransaction, type TxClient } from "@/lib/db";
import { notifyMany } from "@/lib/notifications/service";
import type { PaymentStatus } from "@/lib/payments/service";
import { computeActivation, subscriptionPhase, daysRemaining, type SubscriptionShape } from "./rules";

export interface SubscriptionRecord extends SubscriptionShape {
  id: string;
  tutorId: string;
  planId: string;
  planNameAr: string;
  planNameEn: string;
  planPrice: string;
  planInterval: string;
  durationDays: number;
  graceDays: number;
  paymentStatus: PaymentStatus | null;
  paymentId: string | null;
  /** reference the tutor quotes when sending the BenefitPay proof */
  paymentReference: string | null;
}

const SUBSCRIPTION_COLUMNS = `
  s.id, s.tutor_id as "tutorId", s.plan_id as "planId", s.status,
  s.starts_at as "startsAt", s.expires_at as "expiresAt", s.grace_until as "graceUntil",
  p.name_ar as "planNameAr", p.name_en as "planNameEn", p.price as "planPrice",
  p.interval as "planInterval", p.duration_days as "durationDays", p.grace_days as "graceDays",
  pay.status as "paymentStatus", pay.id as "paymentId", pay.reference_code as "paymentReference"
`;

/** Latest subscription for a tutor (whatever its status). */
export async function getLatestSubscription(tutorId: string): Promise<SubscriptionRecord | null> {
  return queryOne<SubscriptionRecord>(
    `select ${SUBSCRIPTION_COLUMNS}
       from subscriptions s
       join subscription_plans p on p.id = s.plan_id
       left join lateral (
         select id, status, reference_code from payments where subscription_id = s.id order by created_at desc limit 1
       ) pay on true
      where s.tutor_id = $1
      order by s.created_at desc
      limit 1`,
    [tutorId],
  );
}

export interface TutorSubscriptionView {
  subscription: SubscriptionRecord | null;
  phase: ReturnType<typeof subscriptionPhase>;
  daysLeft: number;
  /** true when the tutor may receive new bookings right now */
  listable: boolean;
}

export async function getTutorSubscriptionView(
  tutorId: string,
  now: Date = new Date(),
): Promise<TutorSubscriptionView> {
  const subscription = await getLatestSubscription(tutorId);
  const phase = subscriptionPhase(subscription, now);
  return {
    subscription,
    phase,
    daysLeft: daysRemaining(subscription, now),
    listable: phase === "active" || phase === "grace",
  };
}

function subscriptionReference(tutorId: string): string {
  return `SUB-${tutorId.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

/**
 * Tutor requests a plan. Writes a `pending` subscription and a `pending`
 * payment in one transaction, then tells the admins there is something to
 * verify - the money is never assumed to have arrived.
 *
 * A second request while one is pending is refused: two pending rows would make
 * "which one did the customer pay for?" ambiguous at verification time.
 */
export async function requestPlan(params: {
  tutorId: string;
  tutorUserId: string;
  planId: string;
  now?: Date;
}): Promise<{ subscriptionId: string; paymentId: string; referenceCode: string }> {
  const now = params.now ?? new Date();
  const plan = await queryOne<{ id: string; price: string; duration_days: number; grace_days: number }>(
    `select id, price, duration_days, grace_days from subscription_plans where id = $1 and is_active = true`,
    [params.planId],
  );
  if (!plan) throw new Error("plan_not_found");

  const existingPending = await queryOne<{ id: string }>(
    `select id from subscriptions where tutor_id = $1 and status = 'pending' limit 1`,
    [params.tutorId],
  );
  if (existingPending) throw new Error("already_pending");

  const referenceCode = `${subscriptionReference(params.tutorId)}-${now.getTime().toString(36).slice(-4).toUpperCase()}`;

  const created = await withTransaction(async (tx: TxClient) => {
    // `subscriptions.price` is NOT NULL with no default: the price at the time
    // of the request is part of the record, exactly like a booking's price.
    const subscriptions = await tx.query<{ id: string }>(
      `insert into subscriptions (tutor_id, plan_id, status, price)
       values ($1, $2, 'pending', $3::numeric) returning id`,
      [params.tutorId, plan.id, plan.price],
    );
    const subscriptionId = subscriptions[0]!.id;
    const payments = await tx.query<{ id: string }>(
      `insert into payments (reference_code, subject_type, subscription_id, payer_user_id, amount, method, status)
       values ($1, 'subscription', $2, $3, $4::numeric, 'benefitpay', 'pending')
       returning id`,
      [referenceCode, subscriptionId, params.tutorUserId, plan.price],
    );
    return { subscriptionId, paymentId: payments[0]!.id };
  });

  const admins = await query<{ id: string }>(
    `select u.id from users u
       join user_roles ur on ur.user_id = u.id
       join roles r on r.id = ur.role_id
      where r.code in ('super_admin', 'admin') and u.status = 'active' and u.deleted_at is null`,
  );
  await notifyMany(
    admins.map((a) => a.id),
    "payment.submitted",
    { code: referenceCode },
    { type: "subscription", id: created.subscriptionId },
  );

  return { ...created, referenceCode };
}

/**
 * Activate a subscription. Called ONLY after an admin verified the payment
 * (see admin actions), never from a customer-facing path.
 */
export async function activateSubscription(params: {
  tx?: TxClient;
  tutorId: string;
  planId: string;
  subscriptionId?: string | null;
  now?: Date;
  /**
   * Price to record instead of the plan price. Used by the launch offer, where
   * the activation is free: the row has to say 0, because `subscriptions.price`
   * is the record of what was charged and the launch counter is derived from
   * exactly that value.
   */
  priceOverride?: string | null;
}): Promise<{ startsAt: Date; expiresAt: Date; graceUntil: Date }> {
  const now = params.now ?? new Date();
  const plan = await queryOne<{ duration_days: number; grace_days: number; price: string }>(
    `select duration_days, grace_days, price from subscription_plans where id = $1`,
    [params.planId],
  );
  if (!plan) throw new Error("plan_not_found");

  const current = await getLatestSubscription(params.tutorId);
  const window = computeActivation(
    { durationDays: plan.duration_days, graceDays: plan.grace_days },
    now,
    current && current.id !== params.subscriptionId ? current : null,
  );

  const run = async (tx: TxClient) => {
    if (params.subscriptionId) {
      await tx.query(
        `update subscriptions
            set status = 'active', starts_at = $2, expires_at = $3, grace_until = $4
          where id = $1`,
        [params.subscriptionId, window.startsAt, window.expiresAt, window.graceUntil],
      );
    } else {
      await tx.query(
        `insert into subscriptions (tutor_id, plan_id, status, price, starts_at, expires_at, grace_until)
         values ($1, $2, 'active', $3::numeric, $4, $5, $6)`,
        [
          params.tutorId,
          params.planId,
          params.priceOverride ?? plan.price,
          window.startsAt,
          window.expiresAt,
          window.graceUntil,
        ],
      );
    }
    // An expired listing comes back the moment the subscription is active.
    await tx.query(`update tutors set status = 'approved' where id = $1 and status = 'expired_subscription'`, [
      params.tutorId,
    ]);
    return window;
  };

  if (params.tx) return run(params.tx);
  return withTransaction(run);
}

/** Instruct the scheduled job (reminders/cron) to expire lapsed subscriptions. */
export const EXPIRY_JOB_HINT =
  "runSubscriptionExpiryJob in lib/reminders/service.ts performs the lapse transition";
