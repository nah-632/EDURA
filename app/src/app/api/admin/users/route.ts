import { z } from "zod";

import { applyUserAction, assignUserRole } from "@/lib/admin/actions";
import { actionErrorResponse, parseBody } from "@/lib/admin/api";
import { requireAdminApi } from "@/lib/admin/guard";
import { jsonResponse } from "@/lib/security/http";
import { reasonSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.enum(["restrict", "suspend", "reactivate"]),
    userId: z.string().uuid(),
    reason: reasonSchema.optional().nullable(),
  }),
  z.object({
    action: z.enum(["grant_role", "revoke_role"]),
    userId: z.string().uuid(),
    roleCode: z.enum(["super_admin", "admin", "moderator", "support"]),
  }),
]);

/**
 * POST /api/admin/users
 *
 * Suspending or restricting an account also revokes its live sessions, so a
 * signed-in browser cannot keep using a cookie that was valid a moment ago.
 * Restoring an account never restores sessions - the person signs in again.
 */
export async function POST(request: Request): Promise<Response> {
  const parsed = await parseBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  const permission =
    input.action === "restrict"
      ? "user.restrict"
      : input.action === "grant_role" || input.action === "revoke_role"
        ? "role.manage"
        : "user.ban";

  const gate = await requireAdminApi(request, permission);
  if (!gate.ok) return gate.response;

  try {
    if (input.action === "grant_role" || input.action === "revoke_role") {
      const result = await assignUserRole(gate.ctx, {
        userId: input.userId,
        roleCode: input.roleCode,
        grant: input.action === "grant_role",
      });
      return jsonResponse({ ok: true, ...result });
    }
    const result = await applyUserAction(gate.ctx, {
      userId: input.userId,
      action: input.action,
      reason: input.reason ?? null,
    });
    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    return actionErrorResponse(err);
  }
}
