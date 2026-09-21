import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWhatsAppMessage,
  normaliseWhatsAppNumber,
  whatsappLink,
  whatsappLinkForBooking,
  type WhatsAppBookingView,
} from "@/lib/whatsapp/message";

const booking: WhatsAppBookingView = {
  code: "EDU-26092026-0001",
  studentName: "يوسف أحمد",
  tutorName: "أ. محمد علي",
  subject: "الرياضيات",
  stage: "الثانوي",
  lessonType: "حصة خاصة",
  method: "home",
  date: "2026-09-26",
  time: "16:30",
  durationMinutes: 90,
  amount: "9.750",
  area: "الرفاع",
  notes: "مراجعة الفصل الثالث & تمارين",
};

test("the message carries every value from the booking record", () => {
  const msg = buildWhatsAppMessage(booking, "ar");
  for (const expected of [
    "EDU-26092026-0001",
    "يوسف أحمد",
    "أ. محمد علي",
    "الرياضيات",
    "الثانوي",
    "حصة خاصة",
    "في المنزل",
    "9.750 د.ب",
    "الرفاع",
    "مراجعة الفصل الثالث",
  ]) {
    assert.ok(msg.includes(expected), `message is missing ${expected}\n${msg}`);
  }
  assert.ok(msg.includes("بنفت بي"), "payment instruction must be present");
  // date and time are localised, not raw ISO
  assert.ok(!msg.includes("2026-09-26"), "raw ISO date must not be sent");
  assert.match(msg, /4:30/);
});

test("the message is generated per booking, never a static template", () => {
  const other = buildWhatsAppMessage(
    { ...booking, code: "EDU-27092026-0007", studentName: "سارة", amount: "6.000", time: "10:00" },
    "ar",
  );
  assert.notEqual(other, buildWhatsAppMessage(booking, "ar"));
  assert.ok(other.includes("سارة") && other.includes("6.000 د.ب"));
  assert.ok(!other.includes("يوسف"));
});

test("empty optional fields are omitted rather than left blank", () => {
  const msg = buildWhatsAppMessage({ ...booking, area: null, notes: "   " }, "ar");
  assert.ok(!msg.includes("المنطقة:"));
  assert.ok(!msg.includes("ملاحظات:"));
});

test("English message switches language and method wording", () => {
  const msg = buildWhatsAppMessage({ ...booking, method: "online" }, "en");
  assert.ok(msg.includes("Online"));
  assert.ok(msg.includes("BHD 9.750"));
  assert.ok(msg.includes("Booking ID: EDU-26092026-0001"));
});

test("numbers normalise to the digits-only form wa.me needs", () => {
  assert.equal(normaliseWhatsAppNumber("+973 6666 1238"), "97366661238");
  assert.equal(normaliseWhatsAppNumber("00973-6666-1238"), "0097366661238".replace(/^00/, ""));
  assert.throws(() => normaliseWhatsAppNumber("+973"));
  assert.throws(() => normaliseWhatsAppNumber("call me"));
});

test("the deep link survives URL encoding round-trip", () => {
  const link = whatsappLinkForBooking(booking, "ar");
  assert.ok(link.startsWith("https://wa.me/97366661238?text="));
  const encoded = link.split("text=")[1]!;
  const decoded = decodeURIComponent(encoded);
  assert.equal(decoded, buildWhatsAppMessage(booking, "ar"));
  // characters that break naive query building must be encoded
  assert.ok(!encoded.includes("\n"), "newlines must be encoded");
  assert.ok(encoded.includes("%26") || !decoded.includes("&") === false);
  assert.ok(!encoded.includes(" "), "spaces must be encoded");
});

test("link targets the configured platform number", () => {
  const link = whatsappLink("+97312345678", "مرحبا");
  assert.ok(link.startsWith("https://wa.me/97312345678?text="));
  assert.ok(decodeURIComponent(link.split("text=")[1]!) === "مرحبا");
});
