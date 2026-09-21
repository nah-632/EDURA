import { requireUser } from "@/lib/auth/service";
import { createReview } from "@/lib/reviews/service";
import { apiError, getClientIp, getUserAgent, isSameOrigin, jsonResponse } from "@/lib/security/http";
import { LIMITS, bucketKey, DbRateLimiter } from "@/lib/security/ratelimit";
import { reviewSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * POST /api/reviews
 *
 * A review is written by the customer of a COMPLETED booking, once. The three
 * blocks (§19) are enforced in `createReview` and again by the unique index on
 * `reviews.booking_id`, so a double submit loses to the database rather than
 * creating a second review.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request, request.headers)) return apiError("forbidden", 403);

  let session;
  try {
    session = await requireUser(request);
  } catch {
    return apiError("unauthorized", 401);
  }

  const limiter = new DbRateLimiter();
  try {
    const limit = await limiter.hit(
      bucketKey("review", session.user.id),
      LIMITS.review.limit,
      LIMITS.review.windowSeconds,
    );
    if (!limit.allowed) return apiError("rate_limited", 429);
  } catch {
    return apiError("rate_limited", 429);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("validation", 422);
  }
  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) return apiError("validation", 422);

  try {
    const created = await createReview(
      session.user.id,
      {
        bookingId: parsed.data.bookingId,
        rating: parsed.data.rating,
        comment: parsed.data.comment ?? null,
        categories: parsed.data.categories,
      },
      { ip: getClientIp(request.headers), userAgent: getUserAgent(request.headers) },
    );
    return jsonResponse({ ok: true, ...created }, 201);
  } catch (err) {
    const code = err instanceof Error ? err.message : "unexpected";
    if (code === "not_found") return apiError("not_found", 404);
    if (code === "not_your_booking") return apiError("forbidden", 403);
    if (code === "already_reviewed" || code === "duplicate") return apiError("duplicate", 409);
    if (code === "not_completed") return apiError("invalid_state", 409);
    console.error("[api/reviews]", code);
    return apiError("unexpected", 500);
  }
}
