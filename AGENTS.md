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

> **Stack is not fixed by the PRD.** The defaults below are assumed. If you
> change any of these, update this section first so subsequent agents inherit
> the decision.

- **Framework:** Next.js (App Router) + TypeScript, strict mode
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Styling:** Tailwind CSS
- **Auth:** session-based, email/password, hashed with bcrypt or argon2
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
npm run db:migrate       # prisma migrate dev        (not scaffolded yet)
npm run db:seed          # seed tiers, certs, roles  (not scaffolded yet)
npm run db:studio        # prisma studio             (not scaffolded yet)
```

Never commit with failing `typecheck`, `lint`, or `test`.

**What exists today** is the token pipeline, the tooling gates, and the landing
page at `/`. There is no `prisma/`, no auth, and no payment code — the `db:*`
scripts are placeholders and will error until Phase 2.

Two traps worth knowing before you touch the gates:

- **Never run Prettier over `styles/tokens.css`.** It is compared
  byte-for-byte by `check:tokens`; reformatting it makes `verify` permanently
  red. `.prettierignore` excludes it.
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
| O'Free Levels        | 0         | —            | —          | —     |
| Basic Level          | 300,000   | —            | 1 month    | 6     |
| Basic Level III      | 550,000   | —            | 1 month    | 10    |
| Advanced Level IV    | 750,000   | 375,000      | 2 months   | 15    |
| Advanced Level V     | 900,000   | 450,000      | 3 months   | 20    |
| Higher Advanced VIII | 1,250,000 | 625,000      | 6 months   | 25+   |

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

`Visitor`, `Customer`, `Member (Mentee)`, `Mentor`, `Programme Participant`,
`Event Participant`, `Internship Applicant` (Phase 2), `Show Viewer`,
`Admin`, `Super Admin`, `Staff / Content Manager`.

Enforce least privilege. Admin cannot configure tiers or manage roles —
that is Super Admin only (see PRD §4.2 permission matrix).

---

## 4. Payment ↔ enrolment separation

**Architecturally critical.** Payment records and enrolment records are
separate entities. An enrolment's status changes to `active` **only** when its
linked payment reaches `Verified`.

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
  (auth)/            # login, register, verify, reset
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
  seed.ts            # seeds tiers, cert catalogue, all 11 roles, settings, retention
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

Public site (Home, About, Programmes, Products, Events, Pricing, FAQ, Contact),
signup → brochure/FAQ unlock → WhatsApp Probation Room link, tier catalogue
with upgrade pricing, manual payment + verification, member dashboard,
programme/session CMS, manual attendance, completion checklist, manual
certificate issuance, product orders (physical + digital), community link
management, feedback forms, RBAC, NDPA schema, email notifications.

### Out of scope — do not build, do not stub "just in case"

Payment gateway (Paystack/Flutterwave), QR attendance, automated assignment
scoring, certificate auto-generation, internship module, mentor dashboards,
feedback analytics, Telegram bot, event ticketing with capacity management,
in-app chat/forum, mobile app/PWA, multi-language, affiliate/referral,
advanced analytics, member marketplace.

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
