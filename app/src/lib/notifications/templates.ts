/**
 * Notification copy.
 *
 * Dynamic notifications carry a type + parameters, never rendered strings, so
 * the wording lives here and is resolved at read time in the reader's locale.
 * This is deliberately NOT part of the static i18n dictionary: these strings
 * interpolate booking data and belong to the notification domain, whereas the
 * dictionary holds interface copy.
 *
 * `announcement` is the one type whose text is authored by an admin; it carries
 * both languages in its params and falls back to the other language rather than
 * showing an empty card.
 */
import type { Locale } from "@/lib/i18n";
import { isNotificationType } from "./catalog";

export interface NotificationCopy {
  title: string;
  body: string;
}

type Params = Record<string, unknown>;

function text(params: Params, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

function pick(params: Params, arKey: string, enKey: string, locale: Locale): string {
  const primary = locale === "ar" ? text(params, arKey) : text(params, enKey);
  const secondary = locale === "ar" ? text(params, enKey) : text(params, arKey);
  return primary || secondary;
}

/** Templates per type and language. `{code}` style placeholders are filled. */
const TEMPLATES: Record<string, { ar: NotificationCopy; en: NotificationCopy }> = {
  "booking.new_request": {
    ar: { title: "طلب حجز جديد", body: "وصلك طلب حجز جديد برقم {code}. راجع الطلب واقبله أو اعتذر عنه." },
    en: { title: "New booking request", body: "You have a new booking request {code}. Review it and accept or decline." },
  },
  "booking.created": {
    ar: { title: "تم إنشاء طلب الحجز", body: "طلب الحجز {code} وصلنا. أكمل الدفع عبر بنفت بي ثم أرسل الإثبات على واتساب." },
    en: { title: "Booking request created", body: "We received booking {code}. Complete the payment via BenefitPay and send the proof on WhatsApp." },
  },
  "booking.confirmed": {
    ar: { title: "تم تأكيد الحجز", body: "الحجز {code} مؤكد. تفاصيل الحصة متاحة في لوحتك." },
    en: { title: "Booking confirmed", body: "Booking {code} is confirmed. The lesson details are in your dashboard." },
  },
  "booking.cancelled": {
    ar: { title: "تم إلغاء الحجز", body: "تم إلغاء الحجز {code}. {reason}" },
    en: { title: "Booking cancelled", body: "Booking {code} was cancelled. {reason}" },
  },
  "booking.rejected": {
    ar: { title: "تم رفض الحجز", body: "تم رفض الحجز {code}. {reason}" },
    en: { title: "Booking rejected", body: "Booking {code} was rejected. {reason}" },
  },
  "booking.tutor_accepted": {
    ar: { title: "المعلم قبل الطلب", body: "المعلم قبل طلب الحجز {code} وهو بانتظار الجدولة." },
    en: { title: "Tutor accepted", body: "The tutor accepted booking {code}; it is now waiting to be scheduled." },
  },
  "booking.scheduled": {
    ar: { title: "تمت جدولة الحصة", body: "الحصة {code} مجدولة. تظهر تفاصيل الموعد في لوحتك." },
    en: { title: "Lesson scheduled", body: "Lesson {code} is scheduled. The details are in your dashboard." },
  },
  "booking.completed": {
    ar: { title: "اكتملت الحصة", body: "اكتملت الحصة {code}. شاركنا تقييمك لتجربة أفضل للمرة القادمة." },
    en: { title: "Lesson completed", body: "Lesson {code} is complete. Leave a review to help the next student." },
  },
  "payment.submitted": {
    ar: { title: "إثبات دفع بانتظار التحقق", body: "استلمنا إثبات الدفع للحجز {code}. يتم التحقق يدويًا خلال وقت قصير." },
    en: { title: "Payment proof received", body: "We received the payment proof for {code}. It is verified manually." },
  },
  "payment.verified": {
    ar: { title: "تم التحقق من الدفع", body: "تم التحقق من دفعة الحجز {code}." },
    en: { title: "Payment verified", body: "The payment for booking {code} has been verified." },
  },
  "payment.rejected": {
    ar: { title: "لم يتم قبول إثبات الدفع", body: "إثبات الدفع للحجز {code} لم يتم قبوله. {reason}" },
    en: { title: "Payment proof rejected", body: "The payment proof for {code} was not accepted. {reason}" },
  },
  "payment.refunded": {
    ar: { title: "تم رد المبلغ", body: "تم تسجيل رد مبلغ الحجز {code}." },
    en: { title: "Refund recorded", body: "A refund for booking {code} has been recorded." },
  },
  "tutor.approved": {
    ar: { title: "تم اعتماد ملفك", body: "ملفك معتمد. أبقِ اشتراكك فعّالًا لتظهر في نتائج البحث." },
    en: { title: "Profile approved", body: "Your profile is approved. Keep your subscription active to stay listed." },
  },
  "tutor.rejected": {
    ar: { title: "ملفك يحتاج تعديلًا", body: "لم يتم اعتماد الملف. {reason}" },
    en: { title: "Profile needs changes", body: "Your profile was not approved. {reason}" },
  },
  "tutor.suspended": {
    ar: { title: "تم إيقاف الملف", body: "تم إيقاف ملفك مؤقتًا. {reason}" },
    en: { title: "Profile suspended", body: "Your profile has been suspended. {reason}" },
  },
  "tutor.documents_rejected": {
    ar: { title: "مستند مرفوض", body: "أحد المستندات لم يُقبل. {reason}" },
    en: { title: "Document rejected", body: "One of your documents was not accepted. {reason}" },
  },
  "subscription.expiring": {
    ar: { title: "اشتراكك قارب على الانتهاء", body: "ينتهي اشتراكك خلال {days} يومًا. جدّد للبقاء في نتائج البحث." },
    en: { title: "Subscription expiring", body: "Your subscription expires in {days} days. Renew to stay listed." },
  },
  "subscription.expired": {
    ar: { title: "انتهى الاشتراك", body: "انتهى اشتراكك وتم إخفاء ملفك من البحث. جدّد ليعود الظهور." },
    en: { title: "Subscription expired", body: "Your subscription expired and your profile is hidden from search. Renew to be listed again." },
  },
  "subscription.activated": {
    ar: { title: "تم تفعيل الاشتراك", body: "اشتراكك فعّال حتى {until}." },
    en: { title: "Subscription activated", body: "Your subscription is active until {until}." },
  },
  "reminder.lesson_24h": {
    ar: { title: "تذكير: حصتك غدًا", body: "لديك حصة {code} خلال 24 ساعة." },
    en: { title: "Reminder: lesson tomorrow", body: "You have lesson {code} within 24 hours." },
  },
  "reminder.lesson_2h": {
    ar: { title: "تذكير: حصتك خلال ساعتين", body: "لديك حصة {code} خلال ساعتين." },
    en: { title: "Reminder: lesson in 2 hours", body: "You have lesson {code} in two hours." },
  },
  "review.requested": {
    ar: { title: "قيّم الحصة", body: "اكتملت الحصة {code}. تقييمك يساعد الطلبة الآخرين." },
    en: { title: "Rate your lesson", body: "Lesson {code} is complete. Your review helps other students." },
  },
  "review.published": {
    ar: { title: "تم نشر تقييمك", body: "شكرًا لك، تمت مراجعة تقييمك ونشره." },
    en: { title: "Your review is published", body: "Thank you - your review has been moderated and published." },
  },
  announcement: {
    ar: { title: "إعلان", body: "" },
    en: { title: "Announcement", body: "" },
  },
};

function interpolate(template: string, params: Params): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => text(params, key));
}

/**
 * Render a notification. Unknown types never produce an empty card: the type
 * itself is shown, which is ugly but honest, and is how a new type added to the
 * database before the code is deployed stays visible instead of vanishing.
 */
export function renderNotification(type: string, params: Params, locale: Locale): NotificationCopy {
  if (type === "announcement" || !isNotificationType(type)) {
    const title = pick(params, "titleAr", "titleEn", locale);
    const body = pick(params, "bodyAr", "bodyEn", locale);
    const fallbackTitle = locale === "ar" ? "إعلان" : "Announcement";
    return { title: title || fallbackTitle, body: body || "" };
  }
  const template = TEMPLATES[type];
  if (!template) {
    return { title: type, body: "" };
  }
  const chosen = locale === "ar" ? template.ar : template.en;
  return {
    title: interpolate(chosen.title, params),
    body: interpolate(chosen.body, params).trim(),
  };
}
