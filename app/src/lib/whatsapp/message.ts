/**
 * WhatsApp handoff.
 *
 * The message is built from the booking record - never from a template with
 * baked-in customer data - and is URL-encoded before it becomes a wa.me link.
 * Nothing is sent on the customer's behalf: WhatsApp opens on the conversation
 * and the customer presses send.
 */
import { formatDuration, formatMoney, formatTime, type Locale } from "@/lib/i18n";

export const DEFAULT_WHATSAPP_NUMBER = "+97366661238";

export interface WhatsAppBookingView {
  code: string;
  studentName: string;
  tutorName: string;
  subject: string;
  stage: string;
  lessonType: string;
  method: "home" | "online";
  /** ISO date `YYYY-MM-DD` */
  date: string;
  /** `HH:MM` */
  time: string;
  durationMinutes: number;
  /** decimal string, BHD */
  amount: string;
  area?: string | null;
  notes?: string | null;
  /** Asia/Bahrain is UTC+03:00 year-round */
  utcOffsetHours?: number;
}

const AR_LABELS = {
  greeting: "السلام عليكم،",
  intro: "أرغب في حجز حصة تعليمية.",
  code: "رقم الطلب",
  student: "الطالب",
  tutor: "المدرس",
  subject: "المادة",
  stage: "المرحلة",
  lessonType: "نوع الدرس",
  method: "طريقة التدريس",
  date: "التاريخ",
  time: "الوقت",
  duration: "المدة",
  amount: "المبلغ",
  area: "المنطقة",
  notes: "ملاحظات",
  payment: "سأرسل إثبات التحويل عبر بنفت بي في هذه المحادثة.",
  methodHome: "في المنزل",
  methodOnline: "عن بُعد",
};

const EN_LABELS = {
  greeting: "Hello,",
  intro: "I would like to book a tutoring lesson.",
  code: "Booking ID",
  student: "Student",
  tutor: "Tutor",
  subject: "Subject",
  stage: "Stage",
  lessonType: "Lesson type",
  method: "Teaching method",
  date: "Date",
  time: "Time",
  duration: "Duration",
  amount: "Amount",
  area: "Area",
  notes: "Notes",
  payment: "I will send the BenefitPay transfer proof in this conversation.",
  methodHome: "At home",
  methodOnline: "Online",
};

/** Bahrain wall-clock instant for a date+time pair. */
export function bahrainInstant(date: string, time: string, offsetHours = 3): Date {
  return new Date(`${date}T${time.length === 5 ? `${time}:00` : time}+0${offsetHours}:00`);
}

export function formatLessonDate(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-BH", {
    numberingSystem: "latn",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bahrain",
  }).format(bahrainInstant(date, "12:00"));
}

/**
 * Build the message body. Lines with no value are omitted entirely (a blank
 * "المنطقة:" line looks like a bug to the customer).
 */
export function buildWhatsAppMessage(view: WhatsAppBookingView, locale: Locale): string {
  const L = locale === "ar" ? AR_LABELS : EN_LABELS;
  const rows: [string, string][] = [
    [L.code, view.code],
    [L.student, view.studentName],
    [L.tutor, view.tutorName],
    [L.subject, view.subject],
    [L.stage, view.stage],
    [L.lessonType, view.lessonType],
    [L.method, view.method === "home" ? L.methodHome : L.methodOnline],
    [L.date, formatLessonDate(view.date, locale)],
    [L.time, formatTime(bahrainInstant(view.date, view.time), locale)],
    [L.duration, formatDuration(view.durationMinutes, locale)],
    [L.amount, formatMoney(view.amount, locale)],
  ];
  if (view.area) rows.push([L.area, view.area]);

  const lines = [L.greeting, L.intro, ""];
  for (const [label, value] of rows) {
    lines.push(`${label}: ${value}`);
  }
  if (view.notes && view.notes.trim()) {
    lines.push("", `${L.notes}:`, view.notes.trim());
  }
  lines.push("", L.payment);
  return lines.join("\n");
}

/** Normalise the platform number to the digits-only form wa.me requires. */
export function normaliseWhatsAppNumber(number: string): string {
  // wa.me wants the country code with no "+" and no international "00" prefix.
  const digits = number
    .replace(/[^\d+]/g, "")
    .replace(/^\+/, "")
    .replace(/^00/, "");
  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    throw new Error(`invalid WhatsApp number: ${number}`);
  }
  return digits;
}

/**
 * wa.me deep link. `encodeURIComponent` is applied exactly once, to the whole
 * message, so newlines, Arabic text, `&` and `%` survive the round trip.
 */
export function whatsappLink(number: string, message: string): string {
  const digits = normaliseWhatsAppNumber(number);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function whatsappLinkForBooking(
  view: WhatsAppBookingView,
  locale: Locale,
  number: string = DEFAULT_WHATSAPP_NUMBER,
): string {
  return whatsappLink(number, buildWhatsAppMessage(view, locale));
}
