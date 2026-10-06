/**
 * Input validation (§40). Every schema here is used on the SERVER; the same
 * schemas are reused in the browser for instant feedback so the two can never
 * disagree about what is acceptable.
 */
import { z } from "zod";
// Pure policy module: importing the hashing module here would pull
// `node:crypto` into every browser bundle that validates a form.
import { PASSWORD_MIN_LENGTH } from "@/lib/security/password-policy";

/** Bahrain mobile and landline numbers, stored in E.164. */
export const bahrainPhone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .refine((v) => /^\+973(3|6|7|1)\d{7}$/.test(v), { message: "phone" });

export const email = z.string().trim().toLowerCase().email().max(160);

export const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { message: "passwordMin" })
  .max(200)
  .refine((v) => /[A-Z]/.test(v), { message: "passwordComplexity" })
  .refine((v) => /[a-z]/.test(v), { message: "passwordComplexity" })
  .refine((v) => /[0-9]/.test(v), { message: "passwordComplexity" });

export const localeSchema = z.enum(["ar", "en"]);

/** Decimal money string, at most three decimals (BHD). */
export const money = z
  .string()
  .trim()
  .regex(/^\d{1,7}(\.\d{1,3})?$/, { message: "money" })
  .refine((v) => Number(v) > 0, { message: "positive" });

export const shortText = (min: number, max: number) => z.string().trim().min(min).max(max);
export const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const timeHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "invalidTime" });
export const dateISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "invalidDate" });

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const registerSchema = z.object({
  fullName: shortText(3, 120),
  email,
  phone: bahrainPhone,
  password,
  accountType: z.enum(["student", "tutor"]),
  locale: localeSchema.default("ar"),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "terms" }) }),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
  mfaCode: z.string().trim().max(10).optional().nullable(),
});

// ---------------------------------------------------------------------------
// Students (minor data - separate from the account's own PII)
// ---------------------------------------------------------------------------
export const studentSchema = z.object({
  fullName: shortText(2, 120),
  stageId: z.string().uuid().optional().nullable(),
  grade: optionalText(40),
  gender: z.enum(["male", "female"]).optional().nullable(),
  birthYear: z
    .number()
    .int()
    .min(1990)
    .max(new Date().getFullYear())
    .optional()
    .nullable(),
  notes: optionalText(600),
});

// ---------------------------------------------------------------------------
// Tutor profile
// ---------------------------------------------------------------------------
export const tutorProfileSchema = z.object({
  headlineAr: shortText(10, 140),
  headlineEn: shortText(10, 140),
  bioAr: shortText(60, 2000),
  bioEn: shortText(60, 2000),
  qualification: shortText(2, 160),
  university: optionalText(160),
  major: optionalText(120),
  graduationYear: z.number().int().min(1950).max(2100).optional().nullable(),
  yearsExperience: z.number().int().min(0).max(60),
  pricePerHour: money,
  teachesHome: z.boolean(),
  teachesOnline: z.boolean(),
  gender: z.enum(["male", "female"]).optional().nullable(),
  areaId: z.string().uuid().optional().nullable(),
  areaIds: z.array(z.string().uuid()).max(20).default([]),
  subjectIds: z.array(z.string().uuid()).min(1).max(20),
  stageIds: z.array(z.string().uuid()).min(1).max(6),
  languages: z.array(z.enum(["ar", "en"])).min(1),
}).refine((v) => v.teachesHome || v.teachesOnline, { message: "method_not_offered", path: ["teachesOnline"] })
  .refine((v) => !v.teachesHome || v.areaIds.length > 0, { message: "selectOption", path: ["areaIds"] });

export const availabilitySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: timeHHMM,
  endTime: timeHHMM,
  method: z.enum(["home", "online"]).optional().nullable(),
}).refine((v) => v.endTime > v.startTime, { message: "invalidRange", path: ["endTime"] });

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------
export const bookingRequestSchema = z.object({
  tutorId: z.string().uuid(),
  studentId: z.string().uuid(),
  subjectId: z.string().uuid(),
  stageId: z.string().uuid().optional().nullable(),
  lessonTypeId: z.string().uuid(),
  method: z.enum(["home", "online"]),
  date: dateISO,
  time: timeHHMM,
  durationMinutes: z.number().int().min(30).max(240),
  areaId: z.string().uuid().optional().nullable(),
  addressNote: optionalText(300),
  customerNotes: optionalText(1000),
  idempotencyKey: z.string().trim().min(8).max(80).optional().nullable(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "terms" }) }),
}).refine((v) => v.method !== "home" || Boolean(v.areaId || v.addressNote), {
  message: "required",
  path: ["areaId"],
});

export const reviewSchema = z.object({
  bookingId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: optionalText(1500),
  categories: z.record(z.enum(["clarity", "punctuality", "communication"]), z.number().int().min(1).max(5)).optional(),
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export const reasonSchema = z.string().trim().min(3).max(500);

export const statusChangeSchema = z.object({
  bookingId: z.string().uuid(),
  to: z.string().min(3).max(40),
  reason: optionalText(500),
});

export const paymentDecisionSchema = z.object({
  paymentId: z.string().uuid(),
  decision: z.enum(["verify", "reject", "refund"]),
  reason: optionalText(500),
  reference: optionalText(120),
});

export const catalogItemSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().regex(/^[a-z0-9_]{2,40}$/, { message: "invalidCode" }),
  nameAr: shortText(2, 80),
  nameEn: shortText(2, 80),
  sortOrder: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const lessonTypeSchema = catalogItemSchema.extend({
  defaultDuration: z.number().int().min(30).max(240),
  priceMultiplier: money,
  maxStudents: z.number().int().min(1).max(20).default(1),
  descriptionAr: optionalText(300),
  descriptionEn: optionalText(300),
});

export const planSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().regex(/^[a-z0-9_]{2,40}$/),
  nameAr: shortText(2, 80),
  nameEn: shortText(2, 80),
  price: money,
  interval: z.enum(["monthly", "annual", "one_time"]),
  durationDays: z.number().int().min(1).max(36500),
  graceDays: z.number().int().min(0).max(90),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export const settingsSchema = z.object({
  platformNameAr: shortText(2, 80),
  platformNameEn: shortText(2, 80),
  whatsappNumber: bahrainPhone,
  benefitPayNumber: z.string().trim().min(6).max(30),
  supportEmail: email,
  supportPhone: bahrainPhone,
  currency: z.literal("BHD"),
  cancellationHours: z.number().int().min(0).max(168),
  minLeadTimeHours: z.number().int().min(0).max(720),
  maxAdvanceDays: z.number().int().min(1).max(365),
  reviewModeration: z.boolean(),
  allowTutorDecline: z.boolean(),
  // Guarantee terms (addendum §C): editable because they are commercial policy,
  // bounded because a 0-hour claim window or a 30-session replacement would be
  // a support incident waiting to happen.
  guaranteeEnabled: z.boolean(),
  guaranteeClaimWindowHours: z.number().int().min(1).max(720),
  guaranteeMaxCompletedSessions: z.number().int().min(0).max(10),
  guaranteeReplacementSessions: z.number().int().min(1).max(5),
  // Bounded on purpose: a 100% commission or a 10 000-tutor launch offer is a
  // support incident, not a policy.
  commissionPercent: z.number().int().min(0).max(50),
  launchOfferEnabled: z.boolean(),
  launchOfferTutorLimit: z.number().int().min(0).max(1000),
});

export const notificationComposeSchema = z.object({
  audience: z.enum(["all", "students", "tutors", "user", "tutor"]),
  audienceId: z.string().uuid().optional().nullable(),
  titleAr: shortText(2, 120),
  titleEn: shortText(2, 120),
  bodyAr: shortText(2, 600),
  bodyEn: shortText(2, 600),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type StudentInput = z.infer<typeof studentSchema>;
export type TutorProfileInput = z.infer<typeof tutorProfileSchema>;
export type BookingRequestInput = z.infer<typeof bookingRequestSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;

/** Flatten a ZodError into `{ field: messageKey }` for form rendering. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
