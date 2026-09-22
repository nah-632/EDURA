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
    // An exhaustive switch on the discriminant, not an if with a fall-through.
    // With if/return the checker kept BOTH union members visible in the
    // remaining branch - which cost two deploys, first on `input.reason` then
    // on `input.roleCode`. Listing every literal member narrows each case
    // precisely, and that is the whole point of a discriminated union.
    switch (input.action) {
      case "restrict":
      case "suspend":
      case "reactivate": {
        const result = await applyUserAction(gate.ctx, {
          userId: input.userId,
          action: input.action,
          reason: input.reason ?? null,
        });
        return jsonResponse({ ok: true, ...result });
      }
      case "grant_role":
      case "revoke_role": {
        const result = await assignUserRole(gate.ctx, {
          userId: input.userId,
          roleCode: input.roleCode,
          grant: input.action === "grant_role",
        });
        return jsonResponse({ ok: true, ...result });
      }
      default:
        // Unreachable: bodySchema is a discriminated union over exactly these
        // five actions. Kept so the handler has a response for every path if
        // the schema ever widens.
        return jsonResponse({ ok: false, error: "unexpected_action" }, 400);
    }
  } catch (err) {
    return actionErrorResponse(err);
  }
}
