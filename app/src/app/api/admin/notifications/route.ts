import { sendAnnouncement } from "@/lib/admin/content";
import { actionErrorResponse, parseBody } from "@/lib/admin/api";
import { requireAdminApi } from "@/lib/admin/guard";
import { jsonResponse } from "@/lib/security/http";
import { notificationComposeSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/notifications
 *
 * The response reports how many people the message ACTUALLY reached, next to
 * how many the audience resolved to, plus how many opted out of the category.
 * "Sent successfully" without a number is how a console starts lying.
 *
 * Delivery in v1 is in-app only: the channel is recorded on every row, and no
 * channel that is not wired up is ever claimed to have been used (§17).
 */
export async function POST(request: Request): Promise<Response> {
  const parsed = await parseBody(request, notificationComposeSchema);
  if (!parsed.ok) return parsed.response;

  const gate = await requireAdminApi(request, "notification.send");
  if (!gate.ok) return gate.response;

  try {
    const result = await sendAnnouncement(gate.ctx, {
      audience: parsed.data.audience,
      audienceId: parsed.data.audienceId ?? null,
      titleAr: parsed.data.titleAr,
      titleEn: parsed.data.titleEn,
      bodyAr: parsed.data.bodyAr,
      bodyEn: parsed.data.bodyEn,
    });
    return jsonResponse({ ok: true, ...result, channel: "in_app" });
  } catch (err) {
    return actionErrorResponse(err);
  }
}
