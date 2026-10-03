# AGENTS.md — EHEMS Phase 1

Context file for AI agents working on the EHEMS platform. Read this fully before
making changes. When this file conflicts with the PRD (`EHEMS PRD.md`),
the PRD wins — but flag the conflict rather than silently resolving it.

---

## 1. What this project is

EHEMS (Emerging Healthcare Entrepreneurs Meeting Space) is a Nigerian healthcare
entrepreneurship platform. Phase 1 is a mobile-first responsive web app that
delivers: a public marketing site, a six-tier membership system with one-time
manual payments, a member dashboard with tier-gated materials and community
links, and an admin panel for payment verification, attendance, completion
marking, and certificate issuance.

**Phase 1 is manual by design.** There is no payment gateway, no QR scanning,
no automated scoring, no certificate auto-generation, no mobile app. Do not
build toward these — build the seams that let them arrive in Phase 2.

Target audience: healthcare workers in Nigeria, primarily on mid-range Android
devices over 3G. Optimise for low bandwidth and non-technical users.

---

## 2. Tech stack

> The client confirmed this stack on 2026-09-28. The PRD remains technology
> agnostic; if the stack changes, update this section first so subsequent agents
> inherit the decision.

- **Framework:** Next.js (App Router) + TypeScript, strict mode
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Styling:** Tailwind CSS
- **Auth:** session-based, email/password; Argon2id is required by
  `.agents/rules/security.md`; new hashes use Argon2id and legacy hashes are
  upgraded after successful login.
- **Validation:** Zod at every API boundary
- **Email:** transactional provider behind an abstraction (see §7)
- **Hosting:** two environments, `staging` and `production`

### Commands

```bash
npm run dev              # local dev server
npm run build            # production build
npm run lint             # eslint (typed for ts/tsx)
npm run typecheck        # tsc --noEmit
npm run format           # prettier --write
npm run format:check     # prettier --check — the CI form
npm test                 # node:test — the token pipeline suite
npm run test:app         # vitest + testing library (jsdom)
npm run test:e2e         # playwright — builds, then runs against a prod server
npm run verify           # the gate: check:tokens + typecheck + lint + format:check + test + test:app
npm run build:tokens     # regenerate styles/tokens.css
npm run check:tokens     # fail if styles/tokens.css is stale
npm run db:generate       # prisma generate  (required after `npm ci`; the client is not committed)
npm run db:migrate        # prisma migrate dev   — create + apply a migration
npm run db:deploy         # prisma migrate deploy — apply migrations only, no shadow DB
npm run db:seed           # roles, tiers, certificates, links, retention, settings
npm run db:studio         # prisma studio
```

Never commit with failing `typecheck`, `lint`, or `test`.
**What exists today:** the token pipeline and tooling gates; public marketing
pages; database-backed registration, login, password reset, profile, consent,
and data-subject request intake; Argon2id password hashing with legacy-hash
upgrades; pricing calculations; a manual payment workflow (member proof upload
with encrypted storage, admin verification queue, verified-only activation) and
its admin/member screens; manual attendance marking per programme session with
percentage recomputation; manual completion review that gates every BR-008
condition before an admin marks an enrolment completed; certificate issuance with
immutable member/admin views and public verification; tier-gated materials; an
admin programme/session/material CMS whose mappings are consumed by both paid and
O'Free activation, snapshotting each enrolment's attendance threshold at
activation time; admin-managed community links; member feedback forms with
reviewer-facing anonymity; and product orders with a manual fulfilment queue.
There is no payment gateway. Product order statuses are provisional (D-27) and
the order status vocabulary needs client confirmation before the first sale. NDPA
breach-incident and retention operations and in-app notifications are not built.

Two database facts the schema alone will not tell you, both learned the hard way
in D-27: **`ON DELETE SET NULL` FKs make "exactly one of two nullable subjects"
un-enforceable as a `CHECK` constraint** (deleting the subject legitimately nulls
it), and **PostgreSQL forbids subqueries in `CHECK`**, so any rule spanning two
tables has to live in `lib/` and be pinned by a test. Say so in the migration
comment rather than leaving a gap that reads as covered.


Six traps worth knowing before you touch the gates or the database:

- **The `audit_log` protections are hand-written SQL, not schema.** Prisma cannot
  express triggers, so they live in `prisma/migrations/*_init/migration.sql` and
  `prisma migrate dev` is blind to them: if you drop one in a dev database,
  nothing recreates it. `scripts/verify-audit-trigger.sql` is the only thing that
  notices, and CI runs it. TRUNCATE is blocked by a `BEFORE TRUNCATE` trigger, not
  by `REVOKE` — the revoke is inert while the datasource owns the table.
- **A native Postgres on your machine may already own port 5432.** Check before
  assuming Docker got the port; the container maps `5432:5433` locally when it
  did not.
- **Never run Prettier over `styles/tokens.css`.** It is compared
  byte-for-byte by `check:tokens`; reformatting it makes `verify` permanently
  red. `.prettierignore` excludes it.
- **`prisma migrate dev` is not usable here, and the reason is not the port.** It
  wants a shadow database, and a dev server holding the query-engine DLL on
  Windows makes it fail in a way that looks like a migration problem. Write the
  SQL by hand into a timestamped directory and apply it with `npm run db:deploy`.
  This is not a workaround — see D-27: the generated migration is *wrong* for
  this schema. It emits `ADD COLUMN ... NOT NULL` with no default (fatal where
  rows exist) and silently omits every `CHECK` and partial index, which is where
  the real invariants live.
- **`migrate resolve --rolled-back` after a failed hand-written migration.** The
  file is a transaction, so the failure leaves no partial DDL — but the row is
  recorded as failed and blocks every later `db:deploy` until it is marked
  rolled back.
- **`expect(x.ok).toBe(true)` does not narrow a union in TypeScript.** Vitest
  assertions are not type guards, so `result.id` after an assertion is a
  compile error. Add `if (!result.ok) throw ...` — a real guard, not a cast.
- **`fs` calls on a runtime-computed path need a `turbopackIgnore` comment on a
  bare variable.** `lib/payments/proofs.ts` reads and writes encrypted receipts
  by a path it cannot know at build time, and without the annotation Turbopack
  traces the whole project into the server output — every source file and
  `public/`. The annotation must sit on the bare argument to the fs function;
  putting it inside a `path.join(...)` is silently ignored (vercel/next.js#95125).
- **npm 12 blocks dependency install scripts, so `prisma generate` is not
  optional on a deploy host.** `@prisma/client` generates its client from its own
  `postinstall`. npm 12 skips every dependency install script that is not covered
  by `allowScripts` in `package.json`, which silently leaves the client
  ungenerated and makes `next build`'s `tsc` fail with ~150 phantom errors
  (`no exported member 'ConsentType'`, `Property 'payment' does not exist on
  PrismaClient`) that name real models and enums. Every one of those errors is a
  lie. `build` runs `prisma generate` first precisely so it does not depend on
  that policy; `allowScripts` is only the second layer. Local `verify` and CI both
  hide this — CI has always run `db:generate` by hand.
- **Playwright always builds first.** It runs `next build && next start`, because
  dev serves unminified bundles (~852 KB vs ~188 KB) and any bandwidth assertion
  taken against dev is meaningless.

---

## 3. Non-negotiable business rules

These are confirmed with the client. Violating any of them is a production bug,
not a design preference. Each maps to a rule ID in the PRD (§10).

### Money and tiers

- **One-time payments only. No recurring tier subscriptions. Ever.** (BR-001)
- Yearly tickets apply _only_ to events explicitly flagged as yearly-ticket. (BR-002)
- **Upgrade difference is calculated from official list price — never from the
  amount the member actually paid.** (BR-003)
- Upgrade is only permitted if the previous tier is **fully paid AND fully
  completed**. Otherwise the member pays full price. (BR-004)
- The 50% Advanced discount applies to a **first-time subscriber's first
  Advanced-tier purchase only**. It is **not combinable** with an upgrade
  difference and **does not repeat**. (BR-005, BR-007)
- Discounted prices are exact: Advanced IV = ₦375,000, Advanced V = ₦450,000,
  Higher Advanced VIII = ₦625,000. (BR-006)
- All monetary fields default to **NGN**. Never assume USD. (SEC-020)

### Tier catalogue (exact names — do not rename or reorder)

| Tier                 | Price ₦   | Discounted ₦ | Mentorship | Certs |
| -------------------- | --------- | ------------ | ---------- | ----- |
| O'Free Levels        | 0         | —            | —          | See approved catalogue |
| Basic Level          | 300,000   | —            | 1 month    | See approved catalogue |
| Basic Level III      | 550,000   | —            | 1 month    | See approved catalogue |
| Advanced Level IV    | 750,000   | 375,000      | 2 months   | See approved catalogue |
| Advanced Level V     | 900,000   | 450,000      | 3 months   | See approved catalogue |
| Higher Advanced VIII | 1,250,000 | 625,000      | 6 months   | See approved catalogue |

The client confirmed a total catalogue of 27 certificates (D-5), but the PRD
enumeration and current seed contain 26 names. Do not publish per-tier counts or
claim a complete catalogue until the client supplies the missing name and
confirms its tier mapping.

- **Tiers II, VI, and VII are retired/internal. Never display them anywhere —
  not in the UI, not in comparisons, not in seed data exposed to members.** (BR-016)
- Display order is by `display_order`, never alphabetical or by price.

### Completion and certificates

- Completion requires **all** of: verified payment, ≥60% attendance,
  assignments/tests/projects complete, satisfactory performance, relevant
  feedback. (BR-008)
- In Phase 1 an **admin marks completion manually**. Never auto-complete. (BR-009)
- Certificates are issued **only after** an admin marks the member Completed.
  Issuance is an explicit admin action, not a side effect. (BR-010)
- Certificate names duplicated across tiers are de-duplicated before issuance.

### Community and access

- **General community access is available to every tier including O'Free.**
  EHEMS OPEN sales/marketing benefits begin at **Advanced IV**. (BR-011)
- **No marketplace. Members cannot promote their own services.** Do not build
  member-to-member listings, profiles with service offerings, or DMs. (BR-012)

### Mentors

- Mentors must first have been mentees and qualify through performance. (BR-015)
- Only a **Super Admin** can promote a mentee to Mentor. Admin cannot.

### Roles

The client confirmed five assignable RBAC roles: `Visitor`, `Member (Mentee)`,
`Mentor`, `Admin`, and `Super Admin` (D-3). Other PRD role concepts —
`Customer`, `Programme Participant`, `Event Participant`, `Internship Applicant`
(Phase 2), `Show Viewer`, and `Staff / Content Manager` — are derived from
account or domain state, not independently assignable roles. The code and seed
now expose only these five role keys. Existing databases may still contain
legacy rows for derived concepts; authorization rejects keys outside the
approved catalogue. D-12 records hardcoded permission checks for these five
roles as the Phase 1 technical approach; no `RolePermission` table is planned.

Enforce least privilege. Admin cannot configure tiers or manage roles —
that is Super Admin only (see PRD §4.2 permission matrix).

---

## 4. Payment ↔ enrolment separation

**Architecturally critical.** Payment records and enrolment records are
separate entities. A paid-tier enrolment becomes `active` **only** when its
linked payment reaches `Verified`.

**Confirmed exception:** a zero-cost O'Free enrolment may become active on
creation without a payment (D-1). This exception applies only to zero-cost
tiers; paid-tier activation still requires a linked Verified payment.

```
Pending → Submitted → Under Review → Verified | Rejected
```

- Rejection requires a reason and permits resubmission.
- Every verification/rejection writes an immutable audit log entry (SEC-007).
- Payment proof files are **encrypted at rest** (SEC-004).
- Never compute entitlement from "has a payment record" — compute it from
  "has a Verified payment linked to an active enrolment".

---

## 5. Domain model quick reference

Full schema is PRD §16. Key entities and the traps:

- `User` — Nigerian phone format, soft delete via `deleted_at`,
  `data_retention_until`.
- `ConsentRecord` — captured at registration with version, text, timestamp,
  IP, user agent. Withdrawal sets `withdrawn_at`, never deletes the row.
- `Enrolment` — carries `attendance_percentage`, `certificate_eligible`,
  `upgrade_from_enrolment_id`. This is the spine of member state.
- `AttendanceRecord` — status ∈ {present, absent, late, excused};
  method ∈ {qr, manual, fallback_code}. Phase 1 only writes `manual`.
- `MemberCertificate` — has a `verification_id`. Treat as immutable once issued.
- `AuditLog` — append-only. No UPDATE, no DELETE, ever. (SEC-015)
- `CommunityLink` — keyed by tier and/or programme with an `access_level`
  of `general` or `ehems_open_sales`. Admin-editable without code changes.

Attendance percentage is derived, not stored as truth — recompute from
`AttendanceRecord` rows and cache on `Enrolment`.

---

## 6. Directory conventions

```
app/
  (public)/          # marketing site — no auth
  (auth)/            # login, register, password reset; email verification omitted (CR-06)
  (member)/dashboard/# authenticated member area
  (admin)/admin/     # role-gated admin area
  api/               # route handlers, one folder per resource group
components/
  ui/                # the shared component set
lib/
  db/                # prisma client, queries
  auth/              # session, RBAC middleware, CSRF, rate limiting
  permissions/       # permission checks, keyed to PRD §4.2
  payments/          # state machine — all status transitions live here
  pricing/           # pure tier + upgrade maths
  certificates/      # issuance logic
  notifications/     # channel abstraction
  validation/        # zod schemas, shared client/server
  format/            # formatNaira, formatDate (WAT)
  http/              # response envelope, error → HTTP status mapping
prisma/
  schema.prisma
  seed.ts            # current seed has legacy 11-role data; align to 5 assignable roles
tokens.json          # design token source — the only hand-edited token file
styles/tokens.css    # GENERATED from tokens.json — never hand-edit
styles/type.css      # MD3 type-role utilities, bound to the emitted type tokens
scripts/
  build-tokens.js    # token build + WCAG AA contrast audit
test/
  build-tokens.test.js  # node:test — token pipeline + MD3 contract
  landing-page.test.tsx # vitest + testing library (jsdom)
  helpers/axe.ts        # axe wrapper; documents what jsdom cannot decide
  e2e/                 # playwright specs (real Chromium, 375px + desktop)
.agents/
  rules/             # architecture, code style, design system, security, testing
  skills/            # task-scoped playbooks
  workflows/         # step-by-step procedures
```

**All payment status transitions must go through `lib/payments/`.** Do not
mutate `Payment.status` from a route handler or component.

**Colour, type, spacing, radius, and shadow come from `tokens.json` via the
generated `styles/tokens.css`.** Never hand-edit the stylesheet, never copy a
hex into a component, and never add a colour without adding a semantic role
that the build's contrast audit can verify. `.agents/rules/design-system.md`
is the detailed guide.

**Set type with a role class, not a stack.** `styles/type.css` binds all fifteen
MD3 roles to one utility each — `headline-medium`, `title-large`, `body-large`,
`label-small`, and so on — so a single class sets size, line height, weight, and
tracking. Stacking `text-*` + `leading-*` + `tracking-*` is discouraged. The flat
`font-size-*` scale is retained for incremental adjustment; do not mix the two on
one run of text. Body copy is `body-large` (16px) or larger.

**Phase 1 launches light-only.** `app/layout.tsx` pins `data-theme="light"` on
`<html>`, which overrides `prefers-color-scheme: dark`. The dark palette is still
emitted and still audited so it cannot rot; remove the attribute when the toggle
lands, and do not delete the dark blocks.

**The `.agents/` tree is subordinate to this file.** Where a rule, skill, or
workflow contradicts `AGENTS.md` or the PRD, this file wins — fix the
`.agents/` file rather than working around it.

---

## 7. Conventions

- **Server components by default.** Reach for `"use client"` only when you
  need interactivity, and keep those components small.
- **Validate at the boundary.** Every route handler and server action parses
  input through a Zod schema in `lib/validation/`. No exceptions. Schemas
  check *shape*; business rules live in `lib/`, because a schema that ships
  to the client discloses the rule and can be bypassed.
- **Authorisation is checked server-side, always,** and before the body is
  parsed. Hiding a UI element is not access control. Every protected route
  re-checks role and ownership.
- **Notifications go through an abstraction.** Never call an email provider
  SDK directly from a feature — go through the notification service so SMS,
  WhatsApp, and Telegram can be added in Phase 2 without touching features.
- **Money is integers in kobo**, or a decimal type. Never floats.
- **Dates are stored UTC**, rendered in WAT (UTC+1) for Nigerian users.
- **Community links are data, not code.** Never hardcode a WhatsApp or
  Telegram URL.
- Write accessible markup: semantic elements, labelled inputs, focus states,
  keyboard navigation. Target WCAG 2.1 AA (UX-002).

---

## 8. Compliance requirements (NDPA)

Non-negotiable, and easy to forget mid-feature:

- Consent is captured at registration with version, text, timestamp, IP, and
  user agent. (SEC-011)
- Consent withdrawal must be possible without deleting the account. (SEC-012)
- Data subject requests (access, rectification, erasure, restriction,
  portability, objection) are tracked as first-class records with status and
  handling notes. (SEC-013)
- Breach incidents record detection time, affected count, risk level, and
  NDPC notification timestamps. The 72-hour window is tracked explicitly. (SEC-014)
- Sensitive data (health data, payment proof) is flagged as such. (SEC-017)
- Retention periods are defined per data category. (SEC-016)
- Audit logs are append-only and immutable. (SEC-015)

If you build a feature that touches personal data, check whether it needs a
consent type, a retention policy, or an audit entry before you call it done.

---

## 9. Scope fences

### In scope (Phase 1)

Public site (Home, About, Programmes, Products, event list, Pricing, FAQ, Contact),
signup → brochure/FAQ unlock → WhatsApp Probation Room link, tier catalogue
with upgrade pricing, manual payment + verification, member dashboard,
programme/session CMS, manual attendance, completion checklist, manual
certificate issuance, product orders (physical + digital; community access as a
separate entitlement), community link
management, feedback forms, RBAC, NDPA schema, email notifications, and
admin-managed event content without ticketing or capacity management.

### Out of scope — do not build, do not stub "just in case"

Payment gateway (Paystack/Flutterwave), QR attendance, automated assignment
scoring, certificate auto-generation, internship module, mentor dashboards,
feedback analytics, Telegram bot, event ticketing with capacity management,
in-app chat/forum, mobile app/PWA, multi-language, affiliate/referral,
advanced analytics, vouchers, member marketplace.

If a task seems to require one of these, stop and surface it as a change
request rather than building a partial version.

---

## 10. Definition of done

A change is complete only when:

1. `npm run verify` passes. Once the app is scaffolded, also
   `npm run typecheck`, `npm run lint`, and `npm test`.
2. Input is validated at the boundary and authorisation is enforced server-side.
3. Any payment state change routes through `lib/payments/` and writes an audit log.
4. Any personal-data touchpoint has consent, retention, and audit coverage.
5. The flow works on a 375px-wide viewport and on a throttled 3G connection.
6. Business rules in §3 are honoured — if you changed pricing, tier display,
   or completion logic, add or update a test that pins the rule.
7. New admin actions appear in the audit log.

---

## 11. Working style

- **Ask before assuming** on anything the PRD marks PENDING or ASSUMPTION
  (hosting, domain, stack). Do not invent an answer and build on it.
- **Prefer small, reviewable changes.** One concern per change.
- **Seed data is a contract.** The tier and certificate seed must match PRD §11
  exactly — it is what the client sees on first login.
- **When the PRD is ambiguous, say so.** A wrong guess on pricing or
  entitlement logic costs the client money and trust.
- **Never silently expand scope.** Section 9 exists because the roadmap is
  staged deliberately.

---

## 12. Reference

Full specification: `EHEMS PRD.md`. Open questions and unresolved PRD
contradictions are tracked in `docs/decisions.md` — check it before building
anything that touches pricing, roles, entitlements, or the domain model.
Classification key used throughout: CONFIRMED (client-stated) · PROPOSED
(technical recommendation) · PENDING (awaiting client) · ASSUMPTION.
Treat CONFIRMED rules as immutable without client sign-off.

```

**A few notes on choices I made:**

- **Section 3 is deliberately the longest.** Agents are generally reliable at scaffolding CRUD and unreliable at remembering that upgrade pricing uses list price rather than amount paid, or that Tiers II/VI/VII must never render. Those are the failure modes worth spending the file's budget on.
- **Section 4 exists because the PRD calls out payment/enrolment separation twice** (FR-029, §17.3). That repetition signals the client has been burned by systems that conflate them, so I made the seam explicit and gave it a home directory.
- **The stack in §2 is my recommendation, not the PRD's.** It's marked as assumed. Swap it before your first agent run if you're going elsewhere — an AGENTS.md that lies about the stack is worse than no AGENTS.md.
- **Section 9 lists Phase 2/3 items as explicit non-goals.** Without this, agents tend to build "forward-compatible" stubs for payment gateways and QR scanning, which then rot before Phase 2 arrives.
```
