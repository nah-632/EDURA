/**
 * JSON-LD serialisation for structured data (§31).
 *
 * React renders `<script type="application/ld+json" dangerouslySetInnerHTML>`
 * without escaping, and `JSON.stringify` does not escape `<`, `>` or `&`. A
 * value that reaches JSON-LD from user input (a tutor headline, a subject name)
 * could therefore close the script tag and inject markup that runs for every
 * visitor. Escaping the four dangerous characters plus the JS line separators
 * keeps the payload valid JSON while making a breakout impossible.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export interface TutorJsonLdInput {
  name: string;
  headline?: string | null;
  bio?: string | null;
  area?: string | null;
  ratingAvg?: string | null;
  ratingCount?: number;
  pricePerHour: string;
  currency: string;
  url: string;
  image?: string | null;
  subjects: string[];
}

/** schema.org Person + Offer for a tutor profile page. */
export function tutorJsonLd(input: TutorJsonLdInput): string {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: input.name,
    jobTitle: input.headline ?? undefined,
    description: input.bio ?? undefined,
    url: input.url,
    image: input.image ?? undefined,
    knowsAbout: input.subjects.length ? input.subjects : undefined,
    address: input.area ? { "@type": "PostalAddress", addressLocality: input.area, addressCountry: "BH" } : undefined,
    makesOffer: {
      "@type": "Offer",
      priceCurrency: input.currency,
      price: input.pricePerHour,
      description: "Private tutoring lesson",
      areaServed: { "@type": "Country", name: "Bahrain" },
    },
  };
  if (input.ratingCount && input.ratingCount > 0 && input.ratingAvg) {
    data.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: input.ratingAvg,
      reviewCount: input.ratingCount,
      bestRating: "5",
      worstRating: "1",
    };
  }
  return serializeJsonLd(data);
}

export function organisationJsonLd(params: { name: string; url: string; logo: string; description: string }): string {
  return serializeJsonLd({
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: params.name,
    url: params.url,
    logo: params.logo,
    description: params.description,
    address: { "@type": "PostalAddress", addressCountry: "BH", addressLocality: "Bahrain" },
  });
}

export function faqJsonLd(items: { question: string; answer: string }[]): string {
  return serializeJsonLd({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.question,
      acceptedAnswer: { "@type": "Answer", text: i.answer },
    })),
  });
}

export function breadcrumbJsonLd(trail: { name: string; url: string }[]): string {
  return serializeJsonLd({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: t.url,
    })),
  });
}
