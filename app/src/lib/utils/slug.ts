/**
 * URL slugs.
 *
 * Arabic names do not transliterate deterministically, so a slug built from an
 * Arabic-only name would often be empty. The rule is therefore: use the Latin
 * form when it produces something meaningful, otherwise fall back to a short
 * id - and always keep the slug unique and stable (it is stored on the row).
 */
const ARABIC = /[\u0600-\u06FF]/;

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`"]/g, "")
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** The public URL segment for a tutor profile. */
export function tutorSlug(nameLatin: string | null | undefined, nameArabic: string | null | undefined, id: string): string {
  const shortId = id.replace(/-/g, "").slice(0, 8);
  const candidate = slugify(nameLatin ?? "");
  const usable = candidate.replace(/[^a-z0-9-]/g, "").length >= 3;
  if (usable) return `${candidate}-${shortId}`;
  const arabic = slugify(nameArabic ?? "");
  if (!ARABIC.test(arabic) && arabic.replace(/[^a-z0-9-]/g, "").length >= 3) return `${arabic}-${shortId}`;
  return `tutor-${shortId}`;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Extract the short id suffix from a tutor slug (`mohammed-ali-1a2b3c4d`). */
export function shortIdFromSlug(slug: string): string | null {
  const match = /-([0-9a-f]{8})$/.exec(slug);
  return match ? match[1]! : null;
}
