/**
 * RBAC.
 *
 * Permissions are checked on the server for every sensitive action. The admin
 * navigation hides what you cannot do, but that is presentation only - hiding a
 * button is never the control.
 */
export const PERMISSIONS = [
  "overview.read",
  "tutor.read",
  "tutor.approve",
  "tutor.reject",
  "tutor.suspend",
  "tutor.edit",
  "tutor.document.read",
  "user.read",
  "user.restrict",
  "user.ban",
  "booking.read",
  "booking.update",
  "booking.cancel",
  "payment.read",
  "payment.verify",
  "payment.refund",
  "subscription.manage",
  "review.read",
  "review.moderate",
  "notification.send",
  "catalog.manage",
  "plan.manage",
  "cms.manage",
  "settings.manage",
  "role.manage",
  "audit.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ["super_admin", "admin", "moderator", "support"] as const;
export type RoleCode = (typeof ROLES)[number];

const ALL = [...PERMISSIONS];

/** Role -> permission matrix (single source of truth, mirrored in the seed SQL). */
export const ROLE_PERMISSIONS: Record<RoleCode, readonly Permission[]> = {
  super_admin: ALL,
  admin: ALL.filter((p) => p !== "role.manage"),
  moderator: [
    "overview.read",
    "tutor.read",
    "tutor.document.read",
    "user.read",
    "user.restrict",
    "booking.read",
    "review.read",
    "review.moderate",
    "notification.send",
    "audit.read",
  ],
  support: [
    "overview.read",
    "tutor.read",
    "user.read",
    "booking.read",
    "payment.read",
    "review.read",
    "notification.send",
  ],
};

export function permissionsFor(roleCodes: readonly string[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const code of roleCodes) {
    const perms = ROLE_PERMISSIONS[code as RoleCode];
    if (!perms) continue;
    for (const p of perms) out.add(p);
  }
  return out;
}

export function hasPermission(granted: ReadonlySet<Permission>, required: Permission): boolean {
  return granted.has(required);
}

export function hasAnyPermission(granted: ReadonlySet<Permission>, required: readonly Permission[]): boolean {
  return required.some((p) => granted.has(p));
}

/** Every mutating admin action must carry a reason (§15, §38). */
export const REASON_REQUIRED: readonly Permission[] = [
  "tutor.reject",
  "tutor.suspend",
  "user.restrict",
  "user.ban",
  "booking.cancel",
  "payment.refund",
  "review.moderate",
];

export function requiresReason(permission: Permission): boolean {
  return REASON_REQUIRED.includes(permission);
}
