/**
 * Hero photography resolution.
 *
 * The design direction calls for a full-bleed warm photograph. If a real photo
 * has been supplied it is used (`public/brand/photo/hero.<ext>`); otherwise the
 * hero renders its designed fallback rather than shipping a stock image or an
 * AI-generated person who is not part of the platform. Adding the file is the
 * only step needed to switch - no code change.
 *
 * No generated photography was used for this build: the image models available
 * in this environment were quota-blocked, and using unrelated stock imagery for
 * a trust-building tutoring marketplace would be misleading.
 */
import { existsSync } from "node:fs";
import path from "node:path";

const CANDIDATES = [
  { url: "/brand/photo/hero.webp", file: "hero.webp" },
  { url: "/brand/photo/hero.jpg", file: "hero.jpg" },
  { url: "/brand/photo/hero.jpeg", file: "hero.jpeg" },
  { url: "/brand/photo/hero.png", file: "hero.png" },
];

const BAND_CANDIDATES = [
  { url: "/brand/photo/tutor-band.webp", file: "tutor-band.webp" },
  { url: "/brand/photo/tutor-band.jpg", file: "tutor-band.jpg" },
  { url: "/brand/photo/tutor-band.png", file: "tutor-band.png" },
];

function firstExisting(candidates: { url: string; file: string }[]): string | null {
  const dir = path.join(process.cwd(), "public", "brand", "photo");
  for (const candidate of candidates) {
    if (existsSync(path.join(dir, candidate.file))) return candidate.url;
  }
  return null;
}

export function heroPhotoUrl(): string | null {
  return firstExisting(CANDIDATES);
}

export function bandPhotoUrl(): string | null {
  return firstExisting(BAND_CANDIDATES);
}
