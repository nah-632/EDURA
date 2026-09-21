import { z } from "zod";

import { updateCmsContent } from "@/lib/admin/content";
import { actionErrorResponse, parseBody } from "@/lib/admin/api";
import { requireAdminApi } from "@/lib/admin/guard";
import { jsonResponse } from "@/lib/security/http";

export const dynamic = "force-dynamic";

/** Every field is optional: the editor patches what it changed. */
const cmsSchema = z.object({
  heroTitleAr: z.string().trim().max(160).nullable().optional(),
  heroTitleEn: z.string().trim().max(160).nullable().optional(),
  heroLeadAr: z.string().trim().max(600).nullable().optional(),
  heroLeadEn: z.string().trim().max(600).nullable().optional(),
  promoBannerAr: z.string().trim().max(300).nullable().optional(),
  promoBannerEn: z.string().trim().max(300).nullable().optional(),
  promoActive: z.boolean().optional(),
  aboutIntroAr: z.string().trim().max(1200).nullable().optional(),
  aboutIntroEn: z.string().trim().max(1200).nullable().optional(),
  aboutFamiliesAr: z.string().trim().max(800).nullable().optional(),
  aboutFamiliesEn: z.string().trim().max(800).nullable().optional(),
  aboutTutorsAr: z.string().trim().max(800).nullable().optional(),
  aboutTutorsEn: z.string().trim().max(800).nullable().optional(),
  aboutClosingAr: z.string().trim().max(1200).nullable().optional(),
  aboutClosingEn: z.string().trim().max(1200).nullable().optional(),
  guaranteeIntroAr: z.string().trim().max(1200).nullable().optional(),
  guaranteeIntroEn: z.string().trim().max(1200).nullable().optional(),
  guaranteeSatisfactionAr: z.string().trim().max(1200).nullable().optional(),
  guaranteeSatisfactionEn: z.string().trim().max(1200).nullable().optional(),
  guaranteeNotCoveredAr: z.string().trim().max(1200).nullable().optional(),
  guaranteeNotCoveredEn: z.string().trim().max(1200).nullable().optional(),
  faqAr: z.string().trim().max(4000).nullable().optional(),
  faqEn: z.string().trim().max(4000).nullable().optional(),
  termsAr: z.string().trim().max(8000).nullable().optional(),
  termsEn: z.string().trim().max(8000).nullable().optional(),
  privacyAr: z.string().trim().max(8000).nullable().optional(),
  privacyEn: z.string().trim().max(8000).nullable().optional(),
});

/**
 * POST /api/admin/cms
 *
 * Content editing only: the CMS key is separate from the platform settings row,
 * so an editor working on the About page cannot accidentally change a booking
 * rule. Empty strings are stored as null, which the reader treats as "use the
 * reviewed default" rather than rendering a blank paragraph.
 */
export async function POST(request: Request): Promise<Response> {
  const parsed = await parseBody(request, cmsSchema);
  if (!parsed.ok) return parsed.response;

  const gate = await requireAdminApi(request, "cms.manage");
  if (!gate.ok) return gate.response;

  try {
    const patch: Record<string, string | boolean | null> = {};
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value === undefined) continue;
      patch[key] = typeof value === "string" && value.trim() === "" ? null : value;
    }
    const next = await updateCmsContent(gate.ctx, patch);
    return jsonResponse({ ok: true, content: next });
  } catch (err) {
    return actionErrorResponse(err);
  }
}
