/**
 * Authorisation — the single place a permission decision is made.
 *
 * AGENTS.md §7: authorisation is checked server-side, always, and before the body
 * is parsed. Hiding a UI element is not access control. Every protected route
 * calls `requirePermission` (or `requireRole`) from here, and nothing else.
 *
 * Two properties this module is built to hold:
 *
 * 1. **No role hierarchy.** `hasPermission` compares a role key against the
 *    permission's explicit grant list. There is no "admin or above", no numeric
 *    level, and no transitive check. The three Super-Admin-only actions in §4.2
 *    are the reason: a hierarchy would make `admin` inherit them, which is
 *    exactly the bug AGENTS.md §3 warns about ("Admin cannot configure tiers or
 *    manage roles — that is Super Admin only").
 *
 * 2. **Pure.** Reads the in-code matrix, not the database, so a check is a
 *    synchronous function that needs no session, no query, and no Prisma client.
 *    The seeded `role_permission` rows must agree with this matrix —
 *    `scripts/verify-seed.sql` asserts that and CI runs it — so the two cannot
 *    drift without a red build.
 *
 * Least privilege: callers pass the specific permission they need. There is no
 * `requireAdmin` helper here on purpose, because it invites "or above" thinking.
 */

import { permissionKeyFromString, rolesWithPermission, type PermissionKey } from './matrix';
import { PERMISSIONS } from './matrix';
import type { RoleKey } from './roles';

export {
  MATRIX_ROLE_KEYS,
  NON_MATRIX_ROLE_KEYS,
  ROLES,
  ROLE_KEYS,
  isRoleKey,
  roleId,
  roleLabel,
} from './roles';
export type { RoleKey } from './roles';
export {
  PERMISSIONS,
  PERMISSION_KEYS,
  PERMISSION_LIST,
  PERMISSION_STRS,
  isPermissionKey,
  permissionKeyFromString,
  rolesWithPermission,
} from './matrix';
export type { PermissionDefinition, PermissionKey } from './matrix';

/**
 * A principal whose permissions are being checked.
 *
 * Deliberately just the role — not a User row, not a session. A check takes the
 * minimum it needs, which keeps it callable from a route handler, a test, and a
 * server action without any of them constructing a fake user.
 *
 * `role` is `null` when the user has no role assigned. That is a real state:
 * `User.roleId` is nullable, and a user with no role holds no permissions.
 */
export type Principal = {
  role: RoleKey | null;
};

/**
 * Does this principal hold this permission?
 *
 * Returns false for an unknown permission string rather than throwing, so a
 * typo in a route handler denies access instead of crashing the request. Deny
 * by default is the correct failure direction for an access check: a 500 is not
 * a security control, and an exception thrown from a guard is easy to catch and
 * ignore upstream.
 */
export function hasPermission(principal: Principal, permission: string): boolean {
  const key = permissionKeyFromString(permission);
  if (!key) return false;
  if (!principal.role) return false;
  return rolesWithPermission(key).includes(principal.role);
}

/** As `hasPermission`, but typed on the compile-time key union. */
export function can(principal: Principal, permission: PermissionKey): boolean {
  if (!principal.role) return false;
  return rolesWithPermission(permission).includes(principal.role);
}

/**
 * Every permission this principal holds, as `resource.action` strings.
 *
 * Used by an admin screen listing what a role can do, and by the tests. Not
 * used for enforcement — enforcement is always a specific `hasPermission` call,
 * because checking membership of a granted list is a check that quietly inverts
 * into a check of what is NOT in the list.
 */
export function permissionsFor(principal: Principal): string[] {
  if (!principal.role) return [];
  return (Object.keys(PERMISSIONS) as PermissionKey[])
    .filter((key) => rolesWithPermission(key).includes(principal.role as RoleKey))
    .map((key) => PERMISSIONS[key].key);
}

/** The `resource` a permission belongs to, for a route that groups by resource. */
export function resourceOf(permission: PermissionKey): string {
  return PERMISSIONS[permission].resource;
}
