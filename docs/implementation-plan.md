# EHEMS Phase 1 — Implementation Plan

**Status:** Foundation slice **implemented and verified**. Next.js 16 (App
Router) + TypeScript strict + Tailwind v4 + Prisma is scaffolded; the MD3
typography tokens, the design-token pipeline, and the public marketing site are
live. Phase 2A schema, database session auth, and the Phase 4 notification
abstraction are also built. Payments, pricing, certificates, RBAC, and the admin
panel are still plan only. See §What has been built below.

**Authority order:** `EHEMS PRD.md` → `AGENTS.md` → `.agents/rules/*` → this plan.
Where this plan and a rule disagree, the rule wins and this file is wrong.
Where a rule and the PRD disagree, the PRD wins and the rule gets fixed.

**Companion documents:** `AGENTS.md` (operating rules), `docs/decisions.md`
(17 open contradictions, 8 of them blocking), `.agents/rules/design-system.md`
(token contract).

---

## What has been built

| Area | State |
| ---- | ----- |
| Token pipeline (`tokens.json` → `styles/tokens.css`, WCAG AA audit) | live, 219 properties, 102 role pairs audited |
| MD3 type roles (15) + `motion-*` tokens, bound as Tailwind v4 utilities | live, pinned by the token test |
| Tooling gates: `typecheck`, `lint`, `format:check`, `test`, `test:app`, `test:e2e`, `verify` | live, all green |
| GitHub Actions (`.github/workflows/ci.yml`) | live — `verify`, `schema`, `database`, `e2e` |
| Public marketing site (Home, About, Programmes, Pricing, FAQ, Contact) | live, light-only, a11y + reflow + weight tested |
| Prisma schema, Phase 2A unblocked entities (16 models) | live, migration `20260928095718_init` applied and verified |
| `AuditLog` append-only protections (SEC-015) | live — `BEFORE UPDATE`/`DELETE`/`TRUNCATE` triggers, verified against a live Postgres |
| Postgres session auth (`lib/auth/`), login + register, auth pages | live |
| `lib/auth/rbac`, `lib/auth/csrf`, `lib/auth/rate-limit` | live |
| Notification abstraction (`lib/notifications/`) | live, console provider only |
| Pricing engine (`lib/pricing/`) | live — engine complete, display **blocked** (D-1, D-2) |
| Payments, certificates, admin panel, RBAC matrix, materials | **not started** |

The `prisma/` schema now has a real migration history, applied and verified against
a live Postgres, and the `AuditLog` append-only protections (Phase 1 step 9) are
in place. Two things about them are worth knowing before the next schema change:

- **The protections are hand-written SQL in the migration, not schema.** Prisma
  cannot express triggers, so `prisma migrate dev` is blind to them and will not
  recreate one that goes missing in a dev database.
  `scripts/verify-audit-trigger.sql` is the only thing that notices, and CI runs
  it. The script was confirmed to fail when a trigger is dropped, so it is not a
  vacuous check.
- **TRUNCATE is refused by a `BEFORE TRUNCATE` trigger, not by `REVOKE`.** The
  revoke was written first and verified to be inert: the datasource owns the table
  and is a superuser, and both bypass privilege checks, so TRUNCATE still
  succeeded. The trigger refuses it for every role.

The pricing engine (Phase 7) is live, and a few things about it are worth
knowing before the next schema change:

- **The tier catalogue is the single source of truth, and it is code, not
  seed data.** `lib/pricing/tiers.ts` is the only place tier names, prices, and
  display order are written. The landing page and the pricing page both read
  from it rather than keeping their own arrays, so the two can no longer drift.
- **BR-016 is enforced by the type system, not by a filter.** Tiers II, VI and
  VII are absent from the `TierId` union, so no comparison function can be
  handed a retired tier. The test asserting their absence is a second line of
  defence, not the mechanism.
- **The engine renders nothing.** No naira figure reaches the DOM while D-2 is
  open, so a visitor is never shown a discount they will not be charged.
- **Two lint rules hold the line, and both were proven with throwaway probe
  files rather than assumed.** `ehems/no-float-money` rejects a non-integer
  numeric literal in `lib/pricing/`, which the `Kobo` brand cannot catch, and a
  `no-restricted-syntax` block rejects framework, Prisma, `server-only`, db, and
  dynamic imports from the same directory. The first attempt at the float rule
  was written as a selector and was **vacuous** — ESLint's selector engine tests
  regexes against string values only, so it silently ignored every numeric
  literal. The probe caught it; the rule was rewritten as a `create()` rule.

Three things deliberately absent from the landing page, each for a recorded
reason rather than oversight:

- **No naira figures.** D-2 — the discounted prices are unmodelled, and showing a
  discount to a visitor who will be charged full list price is a
  consumer-protection problem. Pinned by a test.
- **No per-tier certificate counts.** D-5 — the counts do not reconcile. Pinned
  by a test.
- **No WhatsApp link.** D-17 — Probation Room ordering is unanswered, and a
  community link is data, not a hardcoded URL. See the D-17 entry in
  `docs/decisions.md` for the CTA decision and the deviation it records.

The 100vh requirement is implemented as `min-h-dvh` on the hero with the rest of
the page below the fold, not as a hard 100vh lock — a locked height clips content
at 200% zoom and on short landscape viewports, which fails WCAG 1.4.4.

---

## 0. How to use this plan

Before starting any slice, the implementing agent must:

1. Read `AGENTS.md` in full.
2. Read the `.agents/rules/` files relevant to the slice — all five are short.
3. Read the matching `.agents/skills/<name>/SKILL.md`. There are five, and they
   are task-scoped playbooks, not documentation.
4. Read the matching `.agents/workflows/<name>.md` if the slice is one of the
   four known shapes.
5. Check `docs/decisions.md` for a `BLOCKING` item covering the slice. If one
   exists, stop and surface it rather than guessing.

### The token contract (applies to every phase that renders UI)

`tokens.json` is the **only** hand-edited token file. `styles/tokens.css` is
generated and must never be edited by hand — the build writes a header saying
so, and `npm run check:tokens` fails on drift.

- Colour reaches components as **role variables only** (`--color-primary`,
  `--color-on-primary`, …). The 41 palette primitives are resolved at build
  time and are deliberately withheld from the CSS. If you need a colour that
  has no role, you do not reach for a primitive — you add a semantic role to
  `tokens.json` and rebuild, so the contrast audit can verify it.
- Never write a hex, `hsl()`, or arbitrary Tailwind value in a component. There
  are zero hex codes in `.agents/` today and that is the invariant.
- Spacing is 2px-based, and the radius tokens override Tailwind's defaults
  (`--radius-lg: 0.75rem`, not Tailwind's `0.5rem`). Import the token scale
  rather than assuming Tailwind's.
- Dark mode has a three-scope cascade that must be preserved in whatever
  variant mechanism is configured (Phase 1, step 1.4):
  `:root` → `@media (prefers-color-scheme: dark) :root:not([data-theme='light'])`
  → `:root[data-theme='dark']`. The explicit attribute scope comes last and is
  what makes a manual toggle beat the OS preference.
- `StatusChip` owns the payment-status → role mapping. It must not accept a
  colour as a prop. A `progress` variant added without an audited role is the
  exact failure mode already found once.
- `ProgressBar` takes `threshold` as a prop. Never hardcode 60 inside it.
- Known limitation (D-16): `--color-error` on dark *raised* containers is
  ~3.4:1. Use `--color-on-error-container` or `--color-error-container` for
  text on raised surfaces. Documented, not audit-blocking.

### Testing split that must survive Phase 1

`test/build-tokens.test.js` runs on `node:test` with zero dependencies — that is
deliberate, so the token gate works in any bare checkout. App tests go on
Vitest. Do **not** unify them; migrating the token suite would break
`npm run verify` in environments where app dependencies are not installed. The
`verify` script chains both once both exist.

---

## 1. Blocking decisions — needed before the affected work

Eight of the seventeen items in `docs/decisions.md` block construction. The
schema in particular cannot be finalised without them.

| ID | Blocks | Why it blocks |
| --- | --- | --- |
| D-3 | Phase 2B, 6 | Roles table cannot be seeded; `Staff / Content Manager` is unrepresentable at four roles |
| D-12 | Phase 2B, 6 | `RolePermission` is absent from PRD §16 but §4.2 requires per-permission checks |
| D-4 | Phase 2B, 8–11 | `Enrolment.programme_id` is singular while programmes are many-to-many over tiers — the spine of member state |
| D-5 | Phase 2B, 11 | "30+", 27, and 76+ certificate counts cannot all seed; seed is a client-facing contract |
| D-1 | Phase 7 display, 8–9 | ₦0 tier with no payment can never reach `Verified`, so O'Free can never activate |
| D-2 | Phase 7 display, 3 pricing page | Discounted prices are unmodelled and shown unconditionally; who qualifies is undefined |
| D-8 | Phase 8 | `Rejected` has no exit, so a rejected member can never resubmit |
| D-6 | Phase 9 materials | No `Material` entity exists to gate |

Also needed before Phase 1: confirmation of the stack in `AGENTS.md` §2, which
is explicitly recorded there as an assumption rather than a PRD requirement.
And the NFR-008 re-authentication window, which NFR-010 requires to be
measurable (D-14).

Non-blocking items (D-7, D-9, D-10, D-11, D-13, D-15, D-16, D-17) are marked
as build-around; each affected phase below names how.

---

## 2. Phase status at a glance

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Decisions and stack confirmation | **waiting on client** |
| 1 | Foundation, token pipeline wiring, test tooling | **live** |
| 2A | Domain model — unblocked entities | **live** — 16 models, migration applied |
| 2B | Domain model — roles, enrolment, certificates | **blocked** (D-3, D-4, D-5, D-12) |
| 3 | Public marketing site | **live** |
| 4 | Notification abstraction | **live** — console provider only |
| 5 | Auth, sessions, consent capture | **live** |
| 6 | RBAC and permissions | **blocked** (D-3, D-12) |
| 7 | Pricing engine | **engine live**; display **blocked** (D-1, D-2) |
| 8 | Payments and manual verification | **blocked** (D-1, D-4, D-8) |
| 9 | Member dashboard | **blocked** (D-1, D-4, D-6) |
| 10 | Programme and session CMS | **blocked** (D-4) |
| 11 | Attendance, completion, certificates | **blocked** (D-4, D-5) |
| 12 | Orders, feedback, community links | **after 6** |
| 13 | NDPA operations | **after 5** |
| 14 | Hardening and definition-of-done | last |

Phases 1, 3, 4 and 5 are the critical path to having anything demonstrable, and
none of them wait on a client decision. That is deliberate: the point of
starting there is that the decisions get asked with real code on screen instead
of in the abstract.

---

## 3. Phases

### Phase 0 — Unblock

**Goal:** convert the eight blocking decisions and the stack assumption into
decisions.

**Work:** walk `docs/decisions.md` with the client in dependency order — D-3 and
D-12 first because they shape the schema, then D-4, then D-1/D-2, then D-8,
D-5, D-6. Each entry already carries a recommendation and its impact. Record
answers by editing the decision's `Decision:` line, not by rewriting the PRD.
Confirm the `AGENTS.md` §2 stack or replace that section first, then
`.agents/rules/architecture.md` §Stack if the layering changes.

**Gate:** every `BLOCKING` row in §1 above is answered and dated.

**Governing:** `AGENTS.md` §11 (ask before assuming; never silently expand
scope).

---

### Phase 1 — Foundation

**Goal:** a running app that renders token-driven UI and passes a full
lint/typecheck/test gate.

**Work:**

1. Scaffold Next.js App Router with TypeScript `strict: true`, and pin the
   choice made in Phase 0.
2. Wire the token pipeline into the build. Map the role variables into the
   Tailwind theme so `bg-primary` resolves to `var(--color-primary)`, and
   configure the dark variant to match **both** dark scopes in
   `styles/tokens.css` (system preference plus the explicit `data-theme`
   override), with the attribute scope winning. Import the 2px spacing scale and
   the token radius scale so they override Tailwind's defaults.
3. Add a `prefers-reduced-motion` guard for the one motion token in the system
   (`--motion-fast`).
4. Load Montserrat via `next/font`. Note the risk: `next/font/google` fetches at
   build time, which breaks offline builds and adds a network dependency to CI.
   Prefer self-hosting the woff2 files and pointing `next/font/local` at them.
5. Add ESLint and Prettier with the repo's conventions, including a guard so
   `lib/pricing/` cannot pull in a framework or database import, and the rule
   that keeps `any` out in favour of `unknown`. **Both are now implemented.**
   The plan originally asked for `import/no-server-only`; that was the wrong
   shape. It guards client/server boundaries and needs a new dependency, whereas
   the actual invariant is that a money module stays pure. Purity is enforced
   with `no-restricted-syntax` in `eslint.config.mjs`, and the float-money rule
   is a small local plugin (`eslint-rules/no-float-money.mjs`) because
   `no-restricted-syntax` cannot match a regex against a numeric literal.
6. Add Vitest + React Testing Library + `vitest-axe` for app code, and Playwright
   for E2E, **alongside** the existing `node:test` token suite.
7. Stand up Prisma against PostgreSQL, migration scripts, and a local dev
   database. Do not write the schema yet — that is Phase 2.
8. Add the `AGENTS.md` §2 command set to `package.json`: `typecheck`, `lint`,
   `test:e2e`, `db:migrate`, `db:seed`, `db:studio`. Extend `verify` to chain
   `check:tokens`, the token tests, `typecheck`, `lint`, and the app tests, so
   §10 of `AGENTS.md` is enforceable from one command.
9. Add the `AuditLog` append-only database protections now, while there is no
   data: the trigger that rejects `UPDATE` and `DELETE`, and `REVOKE TRUNCATE`
   from the application role. Retrofitting this once rows exist is harder and
   `SEC-015` is not negotiable.
10. Add GitHub Actions running `npm run verify` and the Playwright suite.

**Gate:** `npm run verify` green end to end; a rendered page uses token classes
only and passes `vitest-axe`; Playwright runs the 375px viewport.

**Governing:** `.agents/rules/design-system.md`, `.agents/rules/code-style.md`,
`.agents/rules/security.md` (CSP), `AGENTS.md` §7.

---

### Phase 2A — Domain model, unblocked entities

**Goal:** the schema for everything that does not depend on an open decision.

**Work:** `prisma/schema.prisma` for `User`, `Session`, `ConsentRecord`,
`AuditLog`, `DataSubjectRequest`, `BreachIncident`, `Notification`,
`CommunityLink`, `Product`, `Order`, `FeedbackForm`, `FeedbackResponse`,
`SystemSetting`, `RetentionPolicy`, `Programme`/`Session` where uncontroversial.

- Every model is snake_case with explicit `@map` on every field, and every
  relation has a named back-reference. Multi-relation pairs (`Payment.user`,
  `.opened_by`, `.reviewed_by`; `User` ↔ `Programme`) must be named on **both**
  sides or the schema will not generate.
- Money is `Int` kobo. The top tier is ₦1,250,000 = 125,000,000 kobo, and Int32
  tops out at 2,147,483,647 — so the ceiling is ₦21,474,836.47. Add a seed test
  asserting the headroom rather than leaving it as folklore.
- Dates are stored UTC and rendered WAT through `lib/format/`. Do not store
  pre-formatted strings.
- Retention: anchor each `RetentionPolicy` to a fixed expiry, never "N months
  from last activity", or erasure requests can be defeated indefinitely.
- `ConsentRecord` captures version, text, timestamp, IP and user agent.
  Withdrawal sets `withdrawn_at`; it never deletes the row.
- `AuditLog` is append-only and carries `action`, `actor`, `entity_type`,
  `entity_id`, `metadata`. Reading an audit log is itself an audited action.

**Gate:** `prisma migrate` clean, `prisma generate` clean, a seed test proving
tiers load in `display_order` with tiers II/VI/VII absent, and a test proving
`UPDATE`/`DELETE`/`TRUNCATE` on `AuditLog` all fail.

**Governing:** `.agents/rules/architecture.md` §5, `.agents/rules/security.md`,
`.agents/skills/db-migration-runner/SKILL.md`.

---

### Phase 2B — Domain model, decision-dependent

**Goal:** finish the schema once the client has answered.

**Blocked on D-3, D-4, D-5, D-12.**

- **D-3/D-12:** `Role` and `RolePermission`, seeded from PRD §4.2. Seed all
  eleven roles, not four — but only if Phase 0 confirms eleven.
- **D-4:** the `Enrolment` ↔ `Programme` relationship. This is the single most
  consequential open item: `Enrolment` carries `attendance_percentage`,
  `certificate_eligible` and `upgrade_from_enrolment_id`, and a singular
  `programme_id` cannot express many-to-many tier access. Resolve before
  anything in phases 8–11 is built.
- **D-5:** the certificate catalogue. The seed is a contract — it is what the
  client sees on first login, and it must match PRD §11.3 exactly.
- `Enrolment` and `MemberCertificate` (with `verification_id`, treated as
  immutable once issued) land here or in phase 8 depending on D-4's shape.

**Gate:** schema generates; seed matches §11 exactly; the retired-tier
exclusion is enforced at the query level, not by filtering in the UI.

**Governing:** as Phase 2A, plus `AGENTS.md` §3 tier table.

---

### Phase 3 — Public marketing site

**Goal:** the unauthenticated surface, and the first real exercise of the design
system.

**Work:** `app/(public)/` with Home, About, Programmes, Products, Events, FAQ
and Contact. Build `components/ui/` as the shared set as you go —
`Button`, `Card`, `TierCard`, `StatusChip`, `ProgressBar`, `Prose`,
`SectionHeading`, form controls — each from token classes only.

Hold the **Pricing page** until D-2 is answered. Publishing ₦375,000 next to
₦750,000 to a visitor who will actually be charged ₦750,000 is a
consumer-protection problem, not a display preference.

Events content is gated on D-11 (events are billed but unscoped); build the page
against data that can be empty rather than inventing ticketing.

Optimise for the actual audience: mid-range Android on 3G. System font stack
fallback, no web font blocking first paint, images sized and lazy, no
client-side component where a server component will do.

**Gate:** `vitest-axe` clean on every page, 375px verified, and Lighthouse-style
budgets agreed for 3G. All colour from roles.

**Governing:** `.agents/rules/design-system.md`,
`.agents/skills/component-builder/SKILL.md`,
`.agents/workflows/new-component.md`.

---

### Phase 4 — Notification abstraction

**Goal:** one seam so SMS, WhatsApp and Telegram arrive in Phase 2 without
touching a single feature.

**Work:** `lib/notifications/` with a `Channel` union, a handler map, and
`resolveChannels()`. Register only the channels Phase 1 implements. Provide
both `dispatch()` (awaited) and `dispatchAsync()` (fire-and-forget after
commit) — an earlier draft had an async-only signature that contradicted its
own guidance, and this is the seam where that mistake would propagate.

Templates live in one place, not inline in call sites. Define the Phase 1
matrix, including `payment_verified`, `payment_rejected`, `tier_activated`,
`certificate_issued`, `enrolment_completed`, and consent/DSR messages.

Notifications must fire **after** the transaction commits, never inside it, and
a failed send must not roll back the business action.

**Gate:** a test that a rejected handler cannot corrupt the calling
transaction; a test that no feature module imports a provider SDK directly.

**Governing:** `AGENTS.md` §7, `.agents/skills/email-notification/SKILL.md`.

---

### Phase 5 — Auth, sessions, consent

**Goal:** secure session auth with NDPA consent captured at the door.

**Work:**

1. `app/(auth)/` — register, login, verify, password reset. argon2id.
2. Registration captures `ConsentRecord` (version, text, timestamp, IP, user
   agent) in the same transaction as the user.
3. Session cookies: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`. Rotate the
   session id on login and on any privilege change. Invalidate all sessions on
   password change.
4. CSRF: verify `Origin` on every non-GET route handler. SameSite=Lax covers
   cross-site POST but not same-site subdomain tricks, so the header check is
   not optional.
5. Rate limits with real numbers, not "rate limiting should be considered":
   5 attempts per 15 minutes on login, 3 per hour on reset, temporary lockout
   after 10 failures.
6. CSP as a response header. No `NEXT_PUBLIC_` variable may hold a secret —
   those are compiled into the client bundle.
7. `lib/auth/` — `requireSession`, `requireRole`, `requireOwnership`. Every
   protected route re-checks server-side; hiding a link is not access control.
8. Consent withdrawal must be possible **without** deleting the account
   (SEC-012), and the UI control for it must exist — an earlier draft of the
   skill guidance had removed it, which would have dropped a confirmed
   requirement.

**Gate:** positive *and* negative auth tests (unauthenticated, wrong role, wrong
owner, expired session); a test that a withdrawn consent row still exists; a
test that a rate limit actually trips.

**Governing:** `.agents/rules/security.md`,
`.agents/skills/ndpa-compliance/SKILL.md`.

---

### Phase 6 — RBAC and permissions

**Goal:** least privilege, enforced in one place.

**Blocked on D-3, D-12.**

**Work:** `lib/permissions/` keyed to the PRD §4.2 matrix. Admin cannot
configure tiers or manage roles — Super Admin only. Only a Super Admin may
promote a mentee to Mentor. Re-check role and ownership on every protected
route, before the body is parsed.

**Gate:** a permissions test per matrix row, including the two Super-Admin-only
rows and the mentor-promotion rule, since both are places an Admin-only check
would silently pass review.

**Governing:** `AGENTS.md` §3 Roles, `.agents/rules/security.md`.

---

### Phase 7 — Pricing engine

**Status: engine complete, display blocked.** Shipped in `d0ee762`; the gate
below is met with 28 tests in `test/pricing.test.ts`. What remains for this
phase is the D-1/D-2 display work, which cannot start.

**Goal:** pure, exhaustively tested money maths.

**Work:** `lib/pricing/` with no framework imports. Requirements it must
satisfy:

- **BR-003** — the upgrade difference is computed from **official list price**,
  never from what the member actually paid. This needs its own explicit test
  and is the single easiest rule to get wrong.
- **BR-004** — an upgrade is only permitted when the previous tier is fully
  paid *and* fully completed; otherwise full price applies.
- **BR-005/BR-007** — the 50% Advanced discount is a first-time subscriber's
  first Advanced purchase only. It does not combine with an upgrade difference
  and does not repeat.
- **BR-006** — exact figures: Advanced IV ₦375,000, Advanced V ₦450,000, Higher
  Advanced VIII ₦625,000.
- **BR-001** — one-time payments only, no recurring subscriptions. The type
  system should make a subscription unrepresentable.

**Blocked on D-1 and D-2 for display, not for the engine.** Model discount
eligibility as an explicit input parameter so the pure functions are testable
today; D-2 decides where that input comes from and what the pricing page may
show.

**Gate:** the four worked examples as tests, plus explicit BR-003/004/005
assertions, plus a test that retired tiers II/VI/VII are absent from every
comparison function's output.

**Governing:** `AGENTS.md` §3, `.agents/rules/architecture.md`.

---

### Phase 8 — Payments and manual verification

**Goal:** the manual payment path, with the state machine in one file.

**Blocked on D-1, D-4, D-8.**

**Work:** `lib/payments/transitions.ts` as the only place `Payment.status`
changes — never a route handler, never a component. Statuses: `Pending →
Submitted → Under Review → Verified | Rejected`. Rejection requires a reason and
permits resubmission (D-8 currently makes that impossible). Every transition
writes an audit entry.

Also: proof upload with magic-byte sniffing, a 5MB cap, encryption at rest
(SEC-004) and short-lived signed URLs; an admin queue and review screen; and
amount reconciliation against the expected figure.

Activation: an enrolment becomes `active` only when its linked payment reaches
`Verified`. Entitlement is computed from *a Verified payment on an active
enrolment* — never from "a payment record exists". D-1 must be resolved first,
because a ₦0 tier has no payment to verify.

**Gate:** a transition table test proving illegal moves are rejected; a test
that resubmission works; a test that the amount on file matches the expected
figure; a test that activation did not happen for a pending payment.

**Governing:** `.agents/workflows/payment-verification.md`,
`.agents/rules/architecture.md` §4, `AGENTS.md` §4.

---

### Phase 9 — Member dashboard

**Goal:** the authenticated member surface.

**Blocked on D-1, D-4, D-6.**

**Work:** `app/(member)/dashboard/`. Tier-gated materials (blocked on the
missing `Material` entity), community links, payment history, profile, consent
controls, and data-subject request submission.

**General community access is available to every tier including O'Free**
(BR-011) — the gate that bites is EHEMS OPEN sales/marketing benefits, which
begin at Advanced IV. Getting this backwards locks out the paying tier.

Community links are **data, not code**: a `CommunityLink` row with an
`access_level` of `general` or `ehems_open_sales`, admin-editable without a
developer. Never hardcode a WhatsApp or Telegram URL.

There is no marketplace and no member-to-member promotion, profiles with
service offerings, or DMs (BR-012). Do not stub them "just in case".

**Gate:** a test per access boundary; entitlement computed from
`Verified` + `active`, asserted for each of the six tiers.

**Governing:** `AGENTS.md` §3, `.agents/rules/architecture.md`.

---

### Phase 10 — Programme and session CMS

**Goal:** admins run programmes without a developer (PRD §22.2).

**Blocked on D-4.**

**Work:** admin CRUD for programmes and sessions, tier mapping, and a
per-programme `attendance_threshold` with the 60% floor enforced in `lib/` and
not in a client-shipped Zod schema. Snapshot the threshold onto the enrolment at
activation so a later CMS edit cannot retroactively change whether someone
qualified.

**Gate:** a test that threshold changes do not affect existing enrolments; a
test that tier removal is blocked while affected members exist. That guard
previously counted enrolments by `programme_id`, which is structurally always
zero — count by tier, which is unambiguous.

**Governing:** `.agents/workflows/new-programme.md`.

---

### Phase 11 — Attendance, completion, certificates

**Goal:** the completion spine, all of it manual.

**Blocked on D-4, D-5.**

**Work:**

- **Attendance** — `method = manual` only in Phase 1. Status is one of present,
  absent, late, excused. The percentage is **derived** from `AttendanceRecord`
  rows and cached on the enrolment; the cache is not the truth.
- **Completion** — requires *all* of verified payment, ≥60% attendance,
  assignments/tests/projects complete, satisfactory performance, and relevant
  feedback (BR-008). An admin marks completion manually; never auto-complete
  (BR-009).
- **Certificates** — issued only after an admin marks the member Completed, and
  only as an explicit admin action, never as a side effect (BR-010). Names
  duplicated across tiers are de-duplicated before issuance. `verification_id`
  is public; the record is immutable once issued.

**Gate:** a test per completion condition and one proving that any single
missing condition blocks completion; a test that no certificate exists before
the Completed transition; a de-duplication test.

**Governing:** `AGENTS.md` §3, `.agents/rules/architecture.md`.

---

### Phase 12 — Orders, feedback, community link admin

**Goal:** the remaining in-scope admin surface.

**Blocked on Phase 6** (needs RBAC). Build around D-10 by reading the product
type from a single enum rather than hardcoding the conflicting counts.

Physical and digital product orders, feedback forms, and community link
management. Feedback analytics is Phase 2 and stays out.

**Governing:** `AGENTS.md` §9, `.agents/rules/code-style.md`.

---

### Phase 13 — NDPA operations

**Goal:** the compliance surface that outlives the build.

**Work:** data subject requests as first-class records with status and handling
notes — access, rectification, erasure, restriction, portability, objection
(SEC-013). Breach incidents recording detection time, affected count, risk
level, and NDPC notification timestamps, with the 72-hour window tracked
explicitly (SEC-014). Retention enforcement per data category (SEC-016).
Sensitive-field flagging for health data and payment proof (SEC-017).

Retention must be anchored to a fixed expiry (Phase 2A), and attendance records
must outlive certificates, or the two policies contradict each other and
erasure becomes undecidable.

**Gate:** a test that erasure honours the anchored policy rather than resetting
on activity; a test that a breach record can represent both notified and
not-yet-notified states.

**Governing:** `AGENTS.md` §8, `.agents/skills/ndpa-compliance/SKILL.md`.

---

### Phase 14 — Hardening and definition of done

**Goal:** satisfy `AGENTS.md` §10 in full, not partially.

**Work:** 375px on every page; 3G profile pass; full WCAG 2.1 AA audit with
keyboard navigation and focus states; semantic markup and labelled inputs;
cross-browser check on mid-range Android; append-only audit verification against
the live database; and a scan for leaked `NEXT_PUBLIC_` secrets.

Re-read `AGENTS.md` §10 and demonstrate each numbered item. Anything not
demonstrable is not done.

---

## 4. Invariants that hold in every phase

These are the checks that stop the project drifting back toward the defects
already found. If a slice would violate one, the slice is wrong.

1. **`npm run verify` passes.** Never commit with a failing gate.
2. Authorisation is checked server-side, before the body is parsed.
3. Zod validates *shape*; business rules live in `lib/`.
4. Payment status changes only in `lib/payments/`, and always write an audit
   entry.
5. Every personal-data touchpoint has consent, retention and audit coverage.
6. Colour, type, spacing, radius and shadow come from `tokens.json` via the
   generated stylesheet. No hex in a component, ever.
7. Money is integer kobo. Dates are stored UTC and rendered WAT.
8. Tiers II, VI and VII are never rendered anywhere — not in the UI, not in
   comparisons, not in seed data members can see.
9. No payment gateway, no QR attendance, no auto-scoring, no certificate
   auto-generation, no marketplace. If a task seems to need one, stop and
   raise a change request.
10. One concern per change. Each phase above is further sliced into small
    reviewable units before any of it is built.

## 5. Explicit non-goals

Payment gateway, QR attendance, automated assignment scoring, certificate
auto-generation, internship module, mentor dashboards, feedback analytics,
Telegram bot, capacity-managed event ticketing, in-app chat or forum, mobile
app/PWA, multi-language, affiliate/referral, advanced analytics, member
marketplace. `AGENTS.md` §9 exists because the roadmap is staged deliberately;
building a partial version of any of these is a scope violation, not a
head start.
