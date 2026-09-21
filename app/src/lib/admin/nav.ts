/**
 * Admin navigation.
 *
 * Each entry declares the permission that reveals it. The nav is FILTERED by
 * permission for presentation only - every page re-checks server-side, because
 * hiding a link is not access control (§20).
 */
import type { Permission } from "@/lib/security/rbac";

export interface AdminNavItem {
  href: string;
  labelKey: string;
  permission: Permission;
}

export const adminNav: readonly AdminNavItem[] = [
  { href: "", labelKey: "admin.nav.overview", permission: "overview.read" },
  { href: "/tutors", labelKey: "admin.nav.tutors", permission: "tutor.read" },
  { href: "/users", labelKey: "admin.nav.users", permission: "user.read" },
  { href: "/bookings", labelKey: "admin.nav.bookings", permission: "booking.read" },
  { href: "/payments", labelKey: "admin.nav.payments", permission: "payment.read" },
  { href: "/reviews", labelKey: "admin.nav.reviews", permission: "review.read" },
  { href: "/notifications", labelKey: "admin.nav.notifications", permission: "notification.send" },
  { href: "/catalog", labelKey: "admin.nav.catalog", permission: "catalog.manage" },
  { href: "/lesson-types", labelKey: "admin.nav.lessonTypes", permission: "catalog.manage" },
  { href: "/plans", labelKey: "admin.nav.plans", permission: "plan.manage" },
  { href: "/settings", labelKey: "admin.nav.settings", permission: "settings.manage" },
  { href: "/cms", labelKey: "admin.nav.cms", permission: "cms.manage" },
  { href: "/roles", labelKey: "admin.nav.roles", permission: "role.manage" },
  { href: "/audit", labelKey: "admin.nav.audit", permission: "audit.read" },
];

/** Landing page after an admin signs in: the first module they may actually open. */
export function adminLandingPath(permissions: ReadonlySet<Permission>): string {
  const item = adminNav.find((entry) => permissions.has(entry.permission));
  return item ? `/admin${item.href}` : "/admin";
}
