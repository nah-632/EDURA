import type { MetadataRoute } from "next";

import { locales } from "@/lib/i18n/types";

/**
 * sitemap.xml.
 *
 * Only the PUBLIC, indexable routes are listed, and every one is emitted in
 * both languages with the correct `alternates.languages` mapping — the app is
 * bilingual and a sitemap that omits the Arabic side would leave the primary
 * language out of the index.
 *
 * Tutor profiles are deliberately absent: they are database-driven and
 * paginated, and a static list would either go stale or be generated from an
 * empty database (which is exactly the situation on a fresh deployment). They
 * belong in `generateSitemaps` once there is real inventory, not guessed at
 * here.
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://edura.world";

const PUBLIC_ROUTES = [
  { path: "", priority: 1.0, changeFrequency: "weekly" as const },
  { path: "/tutors", priority: 0.9, changeFrequency: "daily" as const },
  { path: "/how", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/pricing", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/about", priority: 0.6, changeFrequency: "monthly" as const },
  { path: "/rules", priority: 0.4, changeFrequency: "monthly" as const },
  { path: "/contact", priority: 0.5, changeFrequency: "yearly" as const },
  { path: "/legal/terms", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "/legal/privacy", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "/legal/guarantee", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "/legal/cancellation", priority: 0.2, changeFrequency: "yearly" as const },
  { path: "/legal/refund", priority: 0.2, changeFrequency: "yearly" as const },
  { path: "/legal/safety", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "/legal/tutor-terms", priority: 0.2, changeFrequency: "yearly" as const },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return locales.flatMap((locale) =>
    PUBLIC_ROUTES.map((route) => ({
      url: `${SITE}/${locale}${route.path}`,
      lastModified,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
      alternates: {
        languages: Object.fromEntries(
          locales.map((other) => [other, `${SITE}/${other}${route.path}`]),
        ),
      },
    })),
  );
}
