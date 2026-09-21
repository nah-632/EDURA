/**
 * Public catalogue reads (subjects, stages, areas).
 *
 * Reference data is admin-editable and lives in the database; the demo
 * fixtures are only used when no database is configured (local preview and the
 * static harness), never as a silent substitute in production.
 */
import { dbConfigured, query } from "@/lib/db";
import { type Locale } from "@/lib/i18n";
import { demoAreas, demoStages, demoSubjects, type Option } from "./demo";

export type { Option };

interface RefRow {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
}

function map(row: RefRow, locale: Locale): Option {
  return { id: row.id, code: row.code, name: locale === "ar" ? row.name_ar : row.name_en };
}

const QUERIES = {
  subjects: "select id, code, name_ar, name_en from subjects where is_active = true order by sort_order, name_en",
  educational_stages:
    "select id, code, name_ar, name_en from educational_stages where is_active = true order by sort_order, name_en",
  areas: "select id, code, name_ar, name_en from areas where is_active = true order by sort_order, name_en",
} as const;

async function refList(
  source: keyof typeof QUERIES,
  locale: Locale,
  fallback: () => Option[],
): Promise<Option[]> {
  if (!dbConfigured()) return fallback();
  try {
    const rows = await query<RefRow>(QUERIES[source]);
    return rows.map((row) => map(row, locale));
  } catch {
    // A catalogue read must never take a marketing page down.
    return fallback();
  }
}

export function listSubjects(locale: Locale): Promise<Option[]> {
  return refList("subjects", locale, () => demoSubjects(locale));
}

export function listStages(locale: Locale): Promise<Option[]> {
  return refList("educational_stages", locale, () => demoStages(locale));
}

export function listAreas(locale: Locale): Promise<Option[]> {
  return refList("areas", locale, () => demoAreas(locale));
}

export interface PlanData {
  id: string;
  code: string;
  name: string;
  price: string;
  interval: "monthly" | "annual";
  durationDays: number;
  graceDays: number;
  features: string[];
  isDemo: boolean;
}

/**
 * Subscription plans. Pricing is admin-editable data, never a constant in the
 * component - the demo fallback is labelled so the UI can mark it.
 */
export async function listPlans(locale: Locale): Promise<PlanData[]> {
  const demo: PlanData[] = [
    {
      id: "demo-monthly",
      code: "monthly",
      name: locale === "ar" ? "شهري" : "Monthly",
      price: "15.000",
      interval: "monthly",
      durationDays: 30,
      graceDays: 3,
      features:
        locale === "ar"
          ? ["ظهور في نتائج البحث", "صفحة معلم كاملة", "طلبات حجز غير محدودة", "دعم عبر واتساب"]
          : ["Listed in search", "Full tutor profile", "Unlimited booking requests", "WhatsApp support"],
      isDemo: true,
    },
    {
      id: "demo-annual",
      code: "annual",
      name: locale === "ar" ? "سنوي" : "Annual",
      price: "150.000",
      interval: "annual",
      durationDays: 365,
      graceDays: 7,
      features:
        locale === "ar"
          ? ["كل مزايا الخطة الشهرية", "شهران مجانًا", "أولوية في الترتيب", "مراجعة المستندات بسرعة"]
          : ["Everything in monthly", "Two months free", "Priority placement", "Faster document review"],
      isDemo: true,
    },
  ];
  if (!dbConfigured()) return demo;
  try {
    const rows = await query<{
      id: string;
      code: string;
      name_ar: string;
      name_en: string;
      price: string;
      interval: "monthly" | "annual";
      duration_days: number;
      grace_days: number;
      features: string[] | null;
    }>(
      `select id, code, name_ar, name_en, price, interval, duration_days, grace_days, features
         from subscription_plans where is_active = true order by sort_order, price`,
    );
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: locale === "ar" ? row.name_ar : row.name_en,
      price: row.price,
      interval: row.interval,
      durationDays: row.duration_days,
      graceDays: row.grace_days,
      features: Array.isArray(row.features) ? (row.features as string[]) : [],
      isDemo: false,
    }));
  } catch {
    return demo;
  }
}
