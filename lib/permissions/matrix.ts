/**
 * The PRD §4.2 permission matrix, encoded as data.
 *
 * §4.2 is a 13×5 grid of action × role. The table is the Phase 1 permission
 * source of truth; tests assert its grants directly.
 *
 * The three Super-Admin-only actions at the bottom are the reason this file
 * exists as separate data rather than as a role hierarchy. `admin` and
 * `super_admin` are not ordered — there is no "admin or above" anywhere in this
 * module, and `hasPermission` in ./index does exact key comparison, so an
 * Admin-only check cannot pass by being written as a hierarchy check.
 */

import { MATRIX_ROLE_KEYS, type RoleKey } from './roles';

/**
 * One row of the matrix.
 *
 * `resource` and `action` are represented separately per PRD §16.1. The
 * `key` is `${resource}.${action}` and is the only string a caller should pass
 * to `hasPermission`. D-12 means these grants are code-defined in Phase 1.
 */
export type PermissionDefinition = {
  key: string;
  resource: string;
  action: string;
  label: string;
  /**
   * The roles that hold this permission, per §4.2.
   *
   * Every role listed MUST be a matrix role (one of the five columns). Listing a
   * role with no matrix column is a decision this file cannot make on the PRD's
   * behalf, and `test/permissions.test.ts` fails the build if it happens.
   */
  grantedTo: readonly RoleKey[];
};

export const PERMISSIONS = {
  viewPublicSite: {
    key: 'site.view',
    resource: 'site',
    action: 'view',
    label: 'View public site',
    grantedTo: ['visitor', 'member', 'mentor', 'admin', 'super_admin'],
  },
  signUp: {
    key: 'account.sign_up',
    resource: 'account',
    action: 'sign_up',
    label: 'Sign up (free)',
    grantedTo: ['visitor'],
  },
  accessMemberDashboard: {
    key: 'member.dashboard',
    resource: 'member',
    action: 'dashboard',
    label: 'Access member dashboard',
    grantedTo: ['member', 'mentor', 'admin', 'super_admin'],
  },
  downloadProgrammeMaterials: {
    key: 'material.download',
    resource: 'material',
    action: 'download',
    label: 'Download programme materials',
    grantedTo: ['member', 'mentor', 'admin', 'super_admin'],
  },
  accessCommunityLinks: {
    key: 'community.access',
    resource: 'community',
    action: 'access',
    label: 'Access community links',
    grantedTo: ['member', 'mentor', 'admin', 'super_admin'],
  },
  submitPaymentProof: {
    key: 'payment.submit_proof',
    resource: 'payment',
    action: 'submit_proof',
    label: 'Submit payment proof',
    grantedTo: ['member', 'mentor', 'admin', 'super_admin'],
  },
  verifyPayment: {
    key: 'payment.verify',
    resource: 'payment',
    action: 'verify',
    label: 'Verify payment',
    grantedTo: ['admin', 'super_admin'],
  },
  markAttendance: {
    key: 'attendance.mark',
    resource: 'attendance',
    action: 'mark',
    label: 'Mark attendance',
    // §4.2 marks Mentor as "Phase 2". It is granted here because the matrix
    // grants it, and Phase 2 is a scope statement, not a permission change —
    // narrowing it would be inventing a rule the PRD does not state. Phase 1
    // attendance is manual by admin only (BR-009/AGENTS.md §3), which is
    // enforced by who can reach the attendance route, not by this row.
    grantedTo: ['mentor', 'admin', 'super_admin'],
  },
  markCompletion: {
    key: 'completion.mark',
    resource: 'completion',
    action: 'mark',
    label: 'Mark completion',
    // Admin marks completion manually, never automatically (BR-009).
    grantedTo: ['admin', 'super_admin'],
  },
  issueCertificates: {
    key: 'certificate.issue',
    resource: 'certificate',
    action: 'issue',
    label: 'Issue certificates',
    // BR-010: an explicit admin action, never a side effect of completion.
    grantedTo: ['admin', 'super_admin'],
  },
  promoteMentor: {
    key: 'mentor.promote',
    resource: 'mentor',
    action: 'promote',
    label: 'Promote mentor',
    // Super Admin only. AGENTS.md §3: "Admin cannot promote a mentee to Mentor."
    grantedTo: ['super_admin'],
  },
  configureTiers: {
    key: 'tier.configure',
    resource: 'tier',
    action: 'configure',
    label: 'Configure tiers',
    // Super Admin only. AGENTS.md §3.
    grantedTo: ['super_admin'],
  },
  manageRoles: {
    key: 'role.manage',
    resource: 'role',
    action: 'manage',
    label: 'Manage roles',
    // Super Admin only. AGENTS.md §3.
    grantedTo: ['super_admin'],
  },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

/** All thirteen permission keys, in §4.2 row order. */
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

/** All thirteen permission definitions, in §4.2 row order. */
export const PERMISSION_LIST: readonly PermissionDefinition[] = PERMISSION_KEYS.map(
  (key) => PERMISSIONS[key],
);

/** The permission keys as the `${resource}.${action}` strings callers pass. */
export const PERMISSION_STRS: readonly string[] = PERMISSION_LIST.map((p) => p.key);

/**
 * Roles that hold a given permission, per this table.
 *
 * Read from the in-code matrix, NOT from the database. D-12 selects hardcoded
 * checks for Phase 1, so this matrix is the authorization source of truth.
 */
export function rolesWithPermission(key: PermissionKey): readonly RoleKey[] {
  return PERMISSIONS[key].grantedTo;
}

export function isPermissionKey(value: string): value is PermissionKey {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}

/**
 * Resolve a `resource.action` string to its key, or null.
 *
 * Exists because `hasPermission` takes the string form — that is what a route
 * handler has — and looking it up here keeps the string-to-definition step in
 * one place instead of at every call site.
 */
export function permissionKeyFromString(value: string): PermissionKey | null {
  const match = PERMISSION_KEYS.find((k) => PERMISSIONS[k].key === value);
  return match ?? null;
}

export { MATRIX_ROLE_KEYS };
