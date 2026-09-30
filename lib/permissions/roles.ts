/**
 * Approved RBAC target: five assignable roles from the §4.2 matrix.
 *
 * D-3 was confirmed by the client on 2026-09-28: Visitor, Member, Mentor, Admin,
 * and Super Admin are the five assignable RBAC roles. Other PRD role concepts
 * are derived from account/domain state. Persisted `Role.name` values are the
 * canonical keys here, including `super_admin`.
 *
 * Persisted role names and TypeScript role identifiers use one canonical
 * representation, including `super_admin`. Labels are presentation only and
 * must never reach an authorization check.
 */

/**
 * A grantable role, keyed to PRD §4.1.
 *
 * `id` is deterministic and seeded. The three ids that the add_rbac migration
 * backfills (`role-member`, `role-admin`, `role-super-admin`) must stay in step
 * with this catalogue.
 */
export const ROLES = {
  visitor: {
    id: 'role-visitor',
    key: 'visitor',
    label: 'Visitor',
    description:
      'Unauthenticated user. Public site, pricing, programme listings, brochure download.',
    inMatrix: true,
  },
  member: {
    id: 'role-member',
    key: 'member',
    label: 'Member (Mentee)',
    description:
      'Active tier subscriber. Dashboard, programme materials, schedule, community links, attendance, feedback.',
    inMatrix: true,
  },
  mentor: {
    id: 'role-mentor',
    key: 'mentor',
    label: 'Mentor',
    description: 'Promoted from a qualified mentee (BR-015). Only a Super Admin may promote.',
    inMatrix: true,
  },
  admin: {
    id: 'role-admin',
    key: 'admin',
    label: 'Admin',
    description:
      'Platform operations. Members, payment verification, content upload, attendance, completion, certificates, events.',
    inMatrix: true,
  },
  super_admin: {
    id: 'role-super-admin',
    key: 'super_admin',
    label: 'Super Admin',
    description:
      'Full platform control. All admin actions plus tier configuration, role assignment, system settings.',
    inMatrix: true,
  },
} as const;

export type RoleKey = keyof typeof ROLES;

/** The five assignable role keys, in permission-matrix order. */
export const ROLE_KEYS = Object.keys(ROLES) as RoleKey[];

/** Every assignable role has a column in the approved §4.2 matrix. */
export const MATRIX_ROLE_KEYS = ROLE_KEYS;

/** No independently assignable roles exist outside the §4.2 matrix in Phase 1. */
export const NON_MATRIX_ROLE_KEYS: readonly RoleKey[] = [];

export function isRoleKey(value: string): value is RoleKey {
  return Object.prototype.hasOwnProperty.call(ROLES, value);
}

export function roleId(key: RoleKey): string {
  return ROLES[key].id;
}

export function roleLabel(key: RoleKey): string {
  return ROLES[key].label;
}
