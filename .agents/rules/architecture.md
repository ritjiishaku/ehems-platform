---
name: architecture
description: Layering, directory layout, the manual payment state machine, activation point, pricing rules, and the Phase 1 scope fence for EHEMS. Use when adding a route, module, or lib/ package, deciding where code belongs, touching payment status, or judging whether something is in scope for Phase 1.
---

# Architecture Rules

## Stack

- Next.js (App Router) + TypeScript, `strict: true`
- PostgreSQL + Prisma
- Tailwind CSS (scale and colours overridden by `tokens.json` — see
  [design-system.md](design-system.md))
- Zod at every boundary
- Session-based auth, email/password, argon2id

**The client confirmed the application stack on 2026-09-28.** The PRD remains
technology agnostic; `AGENTS.md` §2 is the authoritative project stack record.
Update it first if the stack changes, then this file if the layering is
affected. Password hashing remains governed by the security rules; the stack
confirmation did not select a hash algorithm.

## Layering

```
app/            → routing, rendering, request parsing
  (public)/     → marketing site, no auth
  (auth)/       → login, register, verify, reset
  (member)/     → authenticated member area
    dashboard/
  (admin)/      → role-gated admin area
  api/          → route handlers: authorise → parse → delegate → respond
lib/            → business logic. No framework imports here.
  db/           → Prisma client + query helpers
  auth/         → session, RBAC (requireSession, requireRole, requireOwnership)
  permissions/  → permission checks, keyed to the PRD §4.2 matrix
  validation/   → Zod schemas, shared client/server
  payments/     → THE ONLY place payment status changes
  pricing/      → pure functions for tier + upgrade maths
  certificates/ → issuance rules
  notifications/→ channel abstraction
  format/       → formatNaira, formatDate(WAT) — no framework imports
  http/         → ok/badRequest/serverError envelopes, error→status mapping
  cn.ts         → classname merge helper (UI concern, not business logic)
components/     → React components; components/ui/ is the shared set
  ui/
prisma/         → schema, migrations, seed
```

**Rule:** route handlers and server actions do not contain business logic.
They authorise, parse input, call a `lib/` function, and serialise the result.
If you're writing an `if` about business state inside a route handler, it
belongs in `lib/`.

**Authorise before you parse.** `requireSession()` / `requireRole()` run before
`req.json()`. An unauthenticated caller should not be able to force body
allocation on the server.

**Validation schemas are for shape, not for business rules.** A Zod schema
checks that a field is a well-formed string or a positive integer. "Rejection
reason must be at least 10 characters" and "threshold must be ≥ 60" are
business rules — enforce them in `lib/`, not in a schema that also ships to the
client. A rule in a client-shipped schema is disclosed to the client and
trivially bypassed.

## Payments — manual only (Phase 1)

**There is no payment gateway in Phase 1.** PRD §5.2 puts gateway
integration in Phase 2, and ASM-004 confirms it. Do not add Paystack,
Flutterwave, Stripe, or any other provider. Do not scaffold toward one.

Members pay by bank transfer or mobile money, then upload proof. An admin
verifies. That is the whole system.

### The state machine

```
pending ──submit proof──▶ submitted ──admin opens──▶ under_review
                ▲                                      │
                │                                      │
        resubmit (reason kept          ┌─────────────┴─────────────┐
        in audit log only)             ▼                           ▼
                └─────────────── rejected            verified
                                                   (activates enrolment)
```

Five states, per PRD §14.3, stored in snake_case to match the Prisma enum:
`pending`, `submitted`, `under_review`, `verified`, `rejected`. §14.3 prints
them in Title Case; the stored form is snake_case. Do not rename the states,
do not add states, do not collapse them.

`under_review` is set when an admin opens the payment in the verification
queue — not on submission.

**Resubmission** reuses the same `Payment` row and moves it back
`rejected → submitted`. Do not create a second payment. The prior rejection
reason is **not** cleared from the row — the audit log is the record of what
happened, and a `submitted` payment still carries the reason it was last
rejected for.

### All transitions live in `lib/payments/`

Never mutate `Payment.status` from a route handler, a component, or a
server action. One module owns the machine:

```ts
// lib/payments/transitions.ts
submitProof(paymentId, userId, proof);
openForReview(paymentId, adminId);
verifyPayment(paymentId, adminId);
rejectPayment(paymentId, adminId, reason);
resubmitProof(paymentId, userId, proof); // rejected → submitted
```

Each transition validates the current state, writes the change, and appends
an audit log entry — in one transaction. The transition list is closed: a
status change that is not one of these five functions does not belong in the
codebase.

### The single activation point

For paid tiers, `Enrolment.status` becomes `active` only when a linked `Payment`
reaches `verified`. A zero-cost O'Free enrolment may activate on creation
without a payment (D-1); this exception must be guarded to zero-cost tiers.
Paid activation uses one function:

```ts
// lib/payments/activateEnrolment.ts
// Called from: verifyPayment().
// Idempotent. Safe to call twice.
export async function activateEnrolment(tx, paymentId) {
  /* ... */
}
```

Do not add a payment-gateway caller or gateway-specific scaffolding in Phase 1.
Any future gateway integration requires the later-phase scope approval; if
approved, it must use this same activation function.

**O'Free decision (D-1):** confirmed exception. Activate the zero-cost
enrolment on creation; do not create or auto-verify a zero-amount payment.

### Amounts

Store money as **integer kobo**. Never floats.

Six tiers, exactly as named in PRD §11.1 and `AGENTS.md` §3. Names are
contractual — do not drop "Level" or reorder. Discounted values are not extra
tiers; they are an alternative price for the same tier, shown only when the
member qualifies (BR-005, BR-007).

| Tier                 | List ₦    | List kobo    | Discounted ₦ | Discounted kobo |
| -------------------- | --------- | ------------ | ------------ | --------------- |
| O'Free Levels        | 0         | 0            | —            | —               |
| Basic Level          | 300,000   | 30_000_000   | —            | —               |
| Basic Level III      | 550,000   | 55_000_000   | —            | —               |
| Advanced Level IV    | 750,000   | 75_000_000   | 375,000      | 37_500_000      |
| Advanced Level V     | 900,000   | 90_000_000   | 450,000      | 45_000_000      |
| Higher Advanced VIII | 1,250,000 | 125_000_000  | 625,000      | 62_500_000      |

Currency defaults to NGN. Never assume USD (SEC-020).

### Pricing is pure and tested

All tier maths lives in `lib/pricing/` as pure functions with no DB access:

```ts
calculateTierPrice(tier, member): Kobo
calculateUpgradeDifference(fromTier, toTier, member): Kobo
applyAdvancedDiscount(amount, member): Kobo
```

`member` is a plain value object, not a Prisma record — `lib/pricing/` must
stay importable without a database. It carries only what the pricing rules
need, and the caller loads it:

```ts
type PricingMember = {
  id: string
  isFirstTimeSubscriber: boolean     // no prior Verified payment on any tier
  previousTierPaidInFull: boolean     // latest payment on prior tier is Verified
  previousTierCompleted: boolean      // prior enrolment is Completed
  hasPurchasedAdvanced: boolean       // BR-007 — discount never repeats
}
```

BR-004 depends on **payment and completion state, not on the tier**, so those
fields are the contract. Whoever calls `calculateUpgradeDifference` is
responsible for loading them — usually `lib/payments/` inside the same
transaction. Putting a Prisma query inside `lib/pricing/` to get them violates
the purity rule; omitting them silently loses BR-004, which is the most
expensive bug in this system.

Worked examples that must hold — write these as tests:

- First-time subscriber buys Advanced Level IV directly → **₦375,000**
- Member on Basic Level (₦300k, fully paid + completed) upgrades to Advanced
  Level IV → list diff ₦750k − ₦300k = **₦450,000**. The 50% discount does
  **not** apply (BR-005).
- Member on Basic Level upgrades to Advanced Level IV but has _not_ completed
  → **full price ₦750,000** (BR-004).
- Same member later upgrades Advanced IV → Advanced V → list diff
  ₦900k − ₦750k = **₦150,000**. No discount repeat (BR-007).

Both differences are computed from **official list price**, never from the
amount actually paid (BR-003).

## Domain model notes

- `Enrolment` is the spine of member state. `attendance_percentage` and
  `certificate_eligible` are **caches** — recompute from source rows and
  write back; never treat them as authoritative.
- `AuditLog` is append-only. No UPDATE. No DELETE. Enforce at the DB level
  with a trigger and revoked privileges, not just convention. Revoke `TRUNCATE`
  and table ownership from the application role too — a row trigger does not
  stop `TRUNCATE`.
- `ConsentRecord` is never deleted on withdrawal — set `withdrawn_at`.
- Tiers II, VI, VII are retired. Never render them. Never seed them into
  anything member-facing.
- Column names are `snake_case` in the database (`attendance_percentage`,
  `certificate_eligible`, `withdrawn_at`, `verification_id`). Prisma models
  are camelCase and map explicitly with `@map` / `@@map` — Prisma does not do
  this conversion for you.
- **Resolved (D-4):** `EnrolmentProgramme` is the many-to-many join between
  enrolments and programmes, with a per-programme attendance threshold snapshot.
  This model is present in the current schema. Do not reintroduce a singular
  `Enrolment.programme_id`.

## Community links are data

Never hardcode a WhatsApp or Telegram URL anywhere in the codebase.
All links come from the `CommunityLink` table, filtered by tier and
`access_level` (`general` | `ehems_open_sales`). Admin must be able to
change them without a deploy.

## Deferred — do not build

Payment gateway integration, QR attendance, automated scoring, certificate
auto-generation, internship module, mentor dashboards, feedback analytics,
Telegram bot, event capacity management, in-app community, PWA, i18n,
referrals, marketplace.

If a task appears to need one of these, stop and raise it as a change
request. Do not build a partial version "to be safe", and do not add
`notImplemented` stubs for them.

