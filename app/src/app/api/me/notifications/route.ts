import { z } from "zod";

import { requireUser } from "@/lib/auth/service";
import { listNotifications, markRead, unreadCount } from "@/lib/notifications/service";
import { renderNotification } from "@/lib/notifications/templates";
import { apiError, isSameOrigin, jsonResponse } from "@/lib/security/http";

export const dynamic = "force-dynamic";

/**
 * GET  /api/me/notifications  - the account's inbox, rendered in its own locale
 * POST /api/me/notifications  - mark one or all read
 *
 * Copy is rendered at read time from the notification type, so an English
 * reader sees English text for a notification created while the platform was
 * being used in Arabic.
 */
const bodySchema = z.object({
  action: z.literal("mark_read"),
  ids: z.union([z.literal("all"), z.array(z.string().uuid()).max(200)]),
});

export async function GET(request: Request): Promise<Response> {
  let session;
  try {
    session = await requireUser(request);
  } catch {
    return apiError("unauthorized", 401);
  }
  const [rows, unread] = await Promise.all([
    listNotifications(session.user.id, 50),
    unreadCount(session.user.id),
  ]);
  const locale = session.user.locale;
  return jsonResponse({
    ok: true,
    unread,
    notifications: rows.map((row) => ({
      ...row,
      content: renderNotification(row.type, row.params, locale),
    })),
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request, request.headers)) return apiError("forbidden", 403);

  let session;
  try {
    session = await requireUser(request);
  } catch {
    return apiError("unauthorized", 401);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("validation", 422);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return apiError("validation", 422);

  try {
    const updated = await markRead(session.user.id, parsed.data.ids);
    return jsonResponse({ ok: true, updated });
  } catch (err) {
    console.error("[api/me/notifications]", err instanceof Error ? err.message : "unknown");
    return apiError("unexpected", 500);
  }
}
