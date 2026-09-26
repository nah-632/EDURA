import type { MetadataRoute } from "next";

/**
 * robots.txt.
 *
 * The private surfaces are disallowed, not merely unlinked: a crawler that
 * follows a link into /admin or /dashboard gains nothing (every page there
 * checks the session server-side), but keeping them out of the index is still
 * the correct default for a platform holding tutor documents and family data.
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://edura.world";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/*/admin",
          "/*/admin/",
          "/*/dashboard",
          "/*/dashboard/",
          "/*/tutor/",
          "/*/booking/",
          "/*/login",
          "/*/register",
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
