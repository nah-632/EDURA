import test from "node:test";
import assert from "node:assert/strict";

import {
  audiencePredicate,
  audienceTakesId,
  bucketFor,
  isEnabled,
  notificationHref,
  notificationTypes,
  preferenceBuckets,
  sanitizePrefs,
} from "@/lib/notifications/catalog";
import { renderNotification } from "@/lib/notifications/templates";

/**
 * Notification catalogue and rendering (§17).
 *
 * Copy is generated at read time from the type, so every type must render in
 * both languages with no missing template and no Arabic leaking into an English
 * notification.
 */
test("every notification type belongs to a preference bucket", () => {
  for (const type of notificationTypes) {
    assert.ok(preferenceBuckets.includes(bucketFor(type)), type);
  }
});

test("preferences default to enabled and only an explicit false disables", () => {
  assert.equal(isEnabled(null, "booking.confirmed"), true);
  assert.equal(isEnabled({}, "booking.confirmed"), true);
  assert.equal(isEnabled({ booking_updates: false }, "booking.confirmed"), false);
  // A different bucket must not be affected by one opt-out.
  assert.equal(isEnabled({ booking_updates: false }, "payment.verified"), true);
  assert.equal(isEnabled({ booking_updates: false }, "announcement"), true);
});

test("preferences are sanitised into known buckets only", () => {
  assert.deepEqual(sanitizePrefs({ booking_updates: false, nonsense: true, payment_updates: "yes" }), {
    booking_updates: false,
  });
  assert.deepEqual(sanitizePrefs(null), {});
  assert.deepEqual(sanitizePrefs({ lesson_reminders: true }), { lesson_reminders: true });
});

test("audience predicates exclude suspended accounts and never select everybody by accident", () => {
  const all = audiencePredicate("all");
  assert.match(all.where, /u\.status = 'active'/);
  assert.match(all.where, /u\.deleted_at is null/);

  const students = audiencePredicate("students");
  assert.match(students.where, /primary_role in \('student', 'parent'\)/);
  assert.match(students.where, /status = 'active'/);

  const tutors = audiencePredicate("tutors");
  assert.match(tutors.where, /from tutors t/);
  assert.match(tutors.where, /status = 'active'/);

  // A targeted audience takes the id as a bound parameter, never interpolated.
  for (const audience of ["user", "tutor"] as const) {
    const targeted = audiencePredicate(audience, "00000000-0000-0000-0000-000000000000");
    assert.equal(audienceTakesId(audience), true);
    assert.match(targeted.where, /\$1/);
    assert.deepEqual(targeted.params, ["00000000-0000-0000-0000-000000000000"]);
  }
});

test("deep links resolve from the type, and unknown types link nowhere", () => {
  const id = "11111111-1111-1111-1111-111111111111";
  assert.equal(notificationHref("ar", "booking.confirmed", id), `/ar/dashboard/bookings/${id}`);
  assert.equal(notificationHref("ar", "booking.confirmed", id, true), `/ar/admin/bookings/${id}`);
  assert.equal(notificationHref("en", "subscription.expiring", id), "/en/tutor/subscription");
  assert.equal(notificationHref("en", "booking.confirmed", null), null);
});

test("every type renders a title in both languages, and English stays English", () => {
  const arabic = /[\u0600-\u06FF]/;
  for (const type of notificationTypes) {
    const ar = renderNotification(type, {}, "ar");
    const en = renderNotification(type, {}, "en");
    assert.ok(ar.title.trim().length > 0, `missing Arabic title for ${type}`);
    assert.ok(en.title.trim().length > 0, `missing English title for ${type}`);
    assert.ok(!arabic.test(en.title), `Arabic leaked into the English title for ${type}`);
    assert.ok(!arabic.test(en.body), `Arabic leaked into the English body for ${type}`);
  }
});

test("parameters are interpolated, and absent ones do not leave braces behind", () => {
  const rendered = renderNotification("booking.created", { code: "EDU-20092026-0001" }, "en");
  assert.match(rendered.body, /EDU-20092026-0001/);
  assert.ok(!rendered.body.includes("{code}"));

  // A missing reason must not print "{reason}" at the customer.
  const cancelled = renderNotification("booking.cancelled", { code: "EDU-1" }, "ar");
  assert.ok(!cancelled.body.includes("{reason}"));
});

test("an admin announcement renders in the reader's language with a fallback", () => {
  const params = { titleAr: "صيانة مجدولة", titleEn: "Scheduled maintenance", bodyAr: "نص", bodyEn: "text" };
  assert.equal(renderNotification("announcement", params, "ar").title, "صيانة مجدولة");
  assert.equal(renderNotification("announcement", params, "en").title, "Scheduled maintenance");
  // Only one language supplied: show what exists rather than an empty card.
  assert.equal(renderNotification("announcement", { titleAr: "فقط عربي" }, "en").title, "فقط عربي");
});
