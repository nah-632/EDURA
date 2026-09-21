import { z } from "zod";

import { activateCatalogItem, deactivateCatalogItem, upsertCatalogItem } from "@/lib/admin/content";
import { actionErrorResponse, parseBody } from "@/lib/admin/api";
import { requireAdminApi } from "@/lib/admin/guard";
import { jsonResponse } from "@/lib/security/http";
import { catalogItemSchema, lessonTypeSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

const kindSchema = z.enum(["subjects", "stages", "areas", "lessonTypes"]);

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("upsert"),
    kind: kindSchema,
    item: z.union([catalogItemSchema, lessonTypeSchema]),
  }),
  z.object({ action: z.literal("deactivate"), kind: kindSchema, id: z.string().uuid() }),
  z.object({ action: z.literal("activate"), kind: kindSchema, id: z.string().uuid() }),
]);

/**
 * POST /api/admin/catalog
 *
 * Subjects, stages, areas and lesson types are reference data (§28, §41): the
 * console edits rows, never code. Deactivating is the only removal offered -
 * historic bookings and tutor profiles point at these rows, so deleting one
 * would rewrite history.
 */
export async function POST(request: Request): Promise<Response> {
  const parsed = await parseBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const gate = await requireAdminApi(request, "catalog.manage");
  if (!gate.ok) return gate.response;
  const { ctx } = gate;
  const input = parsed.data;

  try {
    if (input.action === "deactivate") {
      await deactivateCatalogItem(ctx, input.kind, input.id);
      return jsonResponse({ ok: true });
    }
    if (input.action === "activate") {
      await activateCatalogItem(ctx, input.kind, input.id);
      return jsonResponse({ ok: true });
    }
    const item = input.item;
    const result = await upsertCatalogItem(ctx, {
      kind: input.kind,
      id: item.id ?? null,
      code: item.code,
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      sortOrder: item.sortOrder,
      isActive: item.isActive,
      defaultDuration: "defaultDuration" in item ? item.defaultDuration : null,
      priceMultiplier: "priceMultiplier" in item ? item.priceMultiplier : null,
      maxStudents: "maxStudents" in item ? item.maxStudents : null,
    });
    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    return actionErrorResponse(err);
  }
}
