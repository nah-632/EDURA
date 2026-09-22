/**
 * Launch offer: the first N tutors pay nothing.
 *
 * The operator's growth plan is to buy supply before demand — give the first 15
 * tutors a free subscription until there is a base on both sides.
 *
 * The counter is DERIVED, not stored: it counts the distinct tutors who hold a
 * zero-priced subscription. A stored counter would need to be incremented in
 * exactly the right place, could drift from reality after a manual correction,
 * and would be wrong the moment an admin edits a record — the same reason the
 * project refuses to keep a denormalised booking count.
 *
 * No schema change was needed for this: `subscriptions.price` already exists
 * and a free activation is `price = 0`.
 */
import { dbConfigured, queryOne } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export interface LaunchOfferStatus {
  /** the operator has the offer switched on */
  enabled: boolean;
  /** how many tutors the offer covers */
  limit: number;
  /** how many distinct tutors have already taken it */
  claimed: number;
  /** slots left, never negative */
  remaining: number;
  /** enabled AND at least one slot left — i.e. worth showing to a tutor */
  active: boolean;
}

const OFF: LaunchOfferStatus = {
  enabled: false,
  limit: 0,
  claimed: 0,
  remaining: 0,
  active: false,
};

export async function getLaunchOfferStatus(): Promise<LaunchOfferStatus> {
  const settings = await getSettings();
  const enabled = settings.launchOfferEnabled;
  const limit = settings.launchOfferTutorLimit;

  let claimed = 0;
  if (dbConfigured()) {
    try {
      const row = await queryOne<{ n: number }>(
        `select count(distinct tutor_id)::int as n
           from subscriptions
          where price = 0`,
      );
      claimed = row?.n ?? 0;
    } catch {
      // A count failure must not take the pricing page down, and must not
      // invent a number: report the offer as unavailable rather than "15 left".
      return OFF;
    }
  }

  const remaining = Math.max(0, limit - claimed);
  return { enabled, limit, claimed, remaining, active: enabled && remaining > 0 };
}

/**
 * Whether this activation should be free.
 *
 * Called immediately before activating, inside the admin flow, so the decision
 * is made once and from the current counter rather than from a value the UI
 * passed along earlier.
 */
export function launchOfferApplies(status: LaunchOfferStatus, alreadyClaimed: boolean): boolean {
  return status.active && !alreadyClaimed;
}

/** Has this tutor already used the launch offer? */
export async function tutorHasClaimedLaunchOffer(tutorId: string): Promise<boolean> {
  if (!dbConfigured()) return false;
  try {
    const row = await queryOne<{ n: number }>(
      `select count(*)::int as n from subscriptions where tutor_id = $1 and price = 0`,
      [tutorId],
    );
    return (row?.n ?? 0) > 0;
  } catch {
    return false;
  }
}
