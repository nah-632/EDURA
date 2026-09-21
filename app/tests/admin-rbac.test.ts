import test from "node:test";
import assert from "node:assert/strict";

import {
  PERMISSIONS,
  REASON_REQUIRED,
  ROLES,
  ROLE_PERMISSIONS,
  hasAnyPermission,
  hasPermission,
  permissionsFor,
  requiresReason,
} from "@/lib/security/rbac";
import { adminNav } from "@/lib/admin/nav";
import { deletionPlan, RETENTION } from "@/lib/account/retention";

/**
 * Authorization surface (§15, §20, §38).
 *
 * These are the facts the console depends on: which role can do what, which
 * actions demand a written reason, and that every navigation entry maps to a
 * permission that actually exists. A typo in a permission string would silently
 * hide a module from everyone - the failure mode this test exists to prevent.
 */
test("every role grants only permissions that exist", () => {
  const known = new Set<string>(PERMISSIONS);
  for (const role of ROLES) {
    for (const permission of ROLE_PERMISSIONS[role]) {
      assert.ok(known.has(permission), `${role} grants unknown permission ${permission}`);
    }
  }
});

test("only a super admin can manage roles", () => {
  assert.ok(ROLE_PERMISSIONS.super_admin.includes("role.manage"));
  assert.ok(!ROLE_PERMISSIONS.admin.includes("role.manage"));
  assert.ok(!ROLE_PERMISSIONS.moderator.includes("role.manage"));
  assert.ok(!ROLE_PERMISSIONS.support.includes("role.manage"));
});

test("a moderator can review and restrict, but cannot approve tutors or touch payments", () => {
  const moderator = ROLE_PERMISSIONS.moderator;
  assert.ok(moderator.includes("review.moderate"));
  assert.ok(moderator.includes("user.restrict"));
  assert.ok(moderator.includes("tutor.document.read"));
  assert.ok(!moderator.includes("tutor.approve"));
  assert.ok(!moderator.includes("user.ban"));
  assert.ok(!moderator.includes("payment.verify"));
  assert.ok(!moderator.includes("payment.refund"));
  assert.ok(!moderator.includes("settings.manage"));
});

test("support is read-only except for sending notifications", () => {
  const support = ROLE_PERMISSIONS.support;
  assert.ok(support.includes("notification.send"));
  for (const forbidden of ["tutor.approve", "tutor.reject", "tutor.suspend", "user.ban", "booking.update", "payment.verify"] as const) {
    assert.ok(!support.includes(forbidden), forbidden);
  }
});

test("permissions compose across roles and never leak between them", () => {
  const both = permissionsFor(["support", "moderator"]);
  assert.ok(hasPermission(both, "review.moderate"));
  assert.ok(hasPermission(both, "payment.read"));
  assert.ok(!hasPermission(both, "payment.refund"));
  assert.ok(hasAnyPermission(both, ["notification.send", "role.manage"]));

  // An unknown role code grants nothing rather than everything.
  assert.equal(permissionsFor(["teacher"]).size, 0);
  assert.equal(hasPermission(permissionsFor(["teacher"]), "overview.read"), false);
});

test("destructive actions demand a reason, read actions never do", () => {
  for (const permission of ["tutor.reject", "tutor.suspend", "user.restrict", "user.ban", "booking.cancel", "payment.refund"] as const) {
    assert.ok(requiresReason(permission), permission);
  }
  for (const permission of ["overview.read", "tutor.read", "booking.read", "audit.read", "payment.verify"] as const) {
    assert.ok(!requiresReason(permission), permission);
  }
  assert.ok(REASON_REQUIRED.length > 0);
});

test("every console navigation entry maps to a declared permission", () => {
  const known = new Set<string>(PERMISSIONS);
  for (const item of adminNav) {
    assert.ok(known.has(item.permission), `${item.href || "/"} uses unknown permission ${item.permission}`);
    assert.ok(item.labelKey.startsWith("admin.nav."), item.labelKey);
  }
  // The overview is reachable by every role, so the console always has a landing
  // page - a role that could sign in but open nothing would be a dead end.
  const overview = adminNav.find((item) => item.href === "");
  assert.ok(overview);
  for (const role of ROLES) {
    assert.ok(ROLE_PERMISSIONS[role].includes(overview!.permission), role);
  }
});

test("the retention policy states what is deleted and what is kept", () => {
  const plan = deletionPlan(new Date("2026-09-20T00:00:00Z"));
  assert.ok(plan.removed.length >= 3);
  assert.ok(plan.retained.some((entry) => entry.table === "payments"));
  assert.ok(plan.retained.some((entry) => entry.table === "bookings"));
  assert.equal(RETENTION.bookingAndPaymentYears, 7);
  assert.equal(RETENTION.accountRecoveryDays, 30);
  // Booking retention must name the year it ends, not a vague "later".
  const booking = plan.retained.find((entry) => entry.table === "bookings");
  assert.match(booking!.until, /^\d{4}$/);
});
