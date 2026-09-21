import { updatePlatformSettings } from "@/lib/admin/content";
import { actionErrorResponse, parseBody } from "@/lib/admin/api";
import { requireAdminApi } from "@/lib/admin/guard";
import { jsonResponse } from "@/lib/security/http";
import { settingsSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/settings
 *
 * Every business setting lives in one row, including the manual-payment
 * instructions and the guarantee terms (addendum §C). Changing a value here
 * changes the booking rules, the guarantee page and the WhatsApp handoff
 * together, because all three read the same source.
 */
export async function POST(request: Request): Promise<Response> {
  const parsed = await parseBody(request, settingsSchema);
  if (!parsed.ok) return parsed.response;

  const gate = await requireAdminApi(request, "settings.manage");
  if (!gate.ok) return gate.response;

  try {
    const next = await updatePlatformSettings(gate.ctx, parsed.data);
    return jsonResponse({ ok: true, settings: next });
  } catch (err) {
    return actionErrorResponse(err);
  }
}
