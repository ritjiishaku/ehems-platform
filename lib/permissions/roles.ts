/**
 * The eleven roles, and the five-column subset the §4.2 matrix actually names.
 *
 * D-3 (four roles or eleven) is resolved here on repo authority, not client
 * sign-off. `AGENTS.md` §3 lists eleven and names them, matching PRD §4.1:145-157.
 * PRD §5.1:201 also says RBAC covers four, but seeding four would make
 * Staff/Content Manager, Show Viewer, Programme Participant, Event Participant
 * and Customer unrepresentable — and §22.2 requires content managers to publish
 * programmes without a developer. Four is the minority reading of the same
 * document.
 *
 * `RoleKey` is a code-safe key and is what the seed writes to `role.name` and
 * what every access decision compares against. `ROLE_LABEL` is the human name
 * from §4.1 and is presentation only — it must never reach an authorisation
 * check, because renaming a role in the UI would then change who can do what.
 */

/**
 * A grantable role, keyed to PRD §4.1.
 *
 * `id` is deterministic and seeded. The three ids that the add_rbac migration
 * also inserts are `role-member`, `role-admin`, and `role-super-admin` — those
 * three must stay in step, or the backfill will point users at a role row the
 * seed then fails to create.
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
  superAdmin: {
    id: 'role-super-admin',
    key: 'super_admin',
    label: 'Super Admin',
    description:
      'Full platform control. All admin actions plus tier configuration, role assignment, system settings.',
    inMatrix: true,
  },
  customer: {
    id: 'role-customer',
    key: 'customer',
    label: 'Customer',
    description: 'Has purchased a product but not a tier. Product downloads, order history.',
    inMatrix: false,
  },
  programmeParticipant: {
    id: 'role-programme-participant',
    key: 'programme_participant',
    label: 'Programme Participant',
    description: 'Enrolled in a specific programme. Programme-specific materials and sessions.',
    inMatrix: false,
  },
  eventParticipant: {
    id: 'role-event-participant',
    key: 'event_participant',
    label: 'Event Participant',
    description: 'Registered for an event. Event details, ticket, attendance.',
    inMatrix: false,
  },
  internshipApplicant: {
    id: 'role-internship-applicant',
    key: 'internship_applicant',
    label: 'Internship Applicant',
    description:
      'Applied for an internship. Phase 2 — seeded so the role is representable, unused until then.',
    inMatrix: false,
  },
  showViewer: {
    id: 'role-show-viewer',
    key: 'show_viewer',
    label: 'Show Viewer',
    description: 'Accessing EHEMS shows/programmes. Show schedule, replay links where authorised.',
    inMatrix: false,
  },
  staffContentManager: {
    id: 'role-staff-content-manager',
    key: 'staff_content_manager',
    label: 'Staff / Content Manager',
    description: 'Content and support. Content upload, member support, limited admin actions.',
    inMatrix: false,
  },
} as const;

export type RoleKey = keyof typeof ROLES;

/** All eleven role keys, in PRD §4.1 order. */
export const ROLE_KEYS = Object.keys(ROLES) as RoleKey[];

/**
 * The five roles that appear as columns in the §4.2 matrix.
 *
 * The other six are a documented gap, not an oversight: the matrix does not say
 * what Staff/Content Manager may do, and inventing `content.upload` for them
 * would be a permission the PRD does not specify. They are seeded and assignable
 * so the role is representable, and they hold no permissions until the matrix
 * grows. `test/permissions.test.ts` asserts the gap explicitly so it cannot be
 * forgotten — if the client extends the matrix, that test is the thing to change.
 */
export const MATRIX_ROLE_KEYS = ROLE_KEYS.filter((key) => ROLES[key].inMatrix);

/** The six seeded roles with no §4.2 column. Used by the seed and the tests. */
export const NON_MATRIX_ROLE_KEYS = ROLE_KEYS.filter((key) => !ROLES[key].inMatrix);

export function isRoleKey(value: string): value is RoleKey {
  return Object.prototype.hasOwnProperty.call(ROLES, value);
}

export function roleId(key: RoleKey): string {
  return ROLES[key].id;
}

export function roleLabel(key: RoleKey): string {
  return ROLES[key].label;
}
