/**
 * Brand photography.
 *
 * The four photographs supplied by the operator are committed under
 * `public/brand/photo/` and produced by `scripts/prepare_photos.py`, which also
 * strips the branded panel the hero artwork arrived with. Because they are real
 * committed assets there is nothing to resolve at runtime — the previous
 * version of this file probed the filesystem with `existsSync` for an
 * optional hero, which is a build-time hazard for no benefit now that the
 * images exist.
 *
 * `hero-desk.jpg` is the cropped scene: desk, laptop, mug, Bahrain skyline and
 * a dhow at sunset, with no baked-in headline.
 */
export const PHOTOS = {
  hero: "/brand/photo/hero-desk.jpg",
  family: "/brand/photo/family-home.jpg",
  classroom: "/brand/photo/classroom.jpg",
  mug: "/brand/photo/mug.jpg",
} as const;

export function heroPhotoUrl(): string {
  return PHOTOS.hero;
}

export function bandPhotoUrl(): string {
  return PHOTOS.classroom;
}

export function familyPhotoUrl(): string {
  return PHOTOS.family;
}

export function brandMugUrl(): string {
  return PHOTOS.mug;
}
