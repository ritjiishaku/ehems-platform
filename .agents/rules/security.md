---
name: security
description: Authorisation, the payment-verification trust boundary, file uploads, password and session handling, NDPA obligations, audit logging, input handling, and secrets for EHEMS. Use when writing any route handler, touching auth, handling uploads or personal data, or reviewing a change for security holes.
---

# Security Rules

## Authorisation

**Check server-side on every protected route and server action.** Hiding a
UI element is not access control. This is the single most common bug in
apps of this shape.

Authorise **before** parsing the body — see [architecture.md](architecture.md).

```ts
// Every protected route
const session = await requireSession();
await requireRole(session, ["admin", "super_admin"]);
```

- Ownership checks are separate from role checks. An Admin can verify
  payments; that does not mean they can read any member's data without
  reason. **Log admin reads of member records** — under NDPA, staff access to
  member data is itself an auditable event, and an unlogged read is the gap
  that a data-breach investigation cannot close.
- Super Admin only: tier configuration, role assignment, mentor promotion,
  permission changes.
- Admin: operational actions per PRD §4.2. Nothing more.
- Enforce the PRD §4.2 matrix through hardcoded checks for the five assignable
  roles confirmed in D-3. D-12 records no `RolePermission` table as the Phase 1
  technical approach. Keep checks centralized in `lib/permissions/` and session
  validation in `lib/auth/`.

### CSRF

Session cookies are the only credential, so state-changing requests are
CSRF-exposed by default. Mitigation, in order:

1. `SameSite=Lax` on the session cookie (baseline — blocks cross-site POST).
2. **Validate `Origin` (fall back to `Referer`) on every non-GET request**
   against an allowlist of your own origins. Reject on mismatch. This is the
   control that actually holds when a browser or proxy relaxes `SameSite`.
3. No state change may be triggered by a GET.

SameSite alone is not sufficient guidance for a system that moves money and
performs irreversible admin actions, so state the value and add the `Origin`
check.

### Content Security Policy

Set a CSP `Content-Security-Policy` header: `default-src 'self'`,
`script-src 'self' 'nonce-…'`, `style-src 'self' 'unsafe-inline'` (Tailwind
inlines), `img-src 'self' data:`, `frame-ancestors 'none'`, `base-uri 'self'`,
`form-action 'self'`. Nonces on inline scripts, no `unsafe-eval`. If
`dangerouslySetInnerHTML` is genuinely needed for admin-authored content, name
the sanitiser explicitly (e.g. DOMPurify, server-side) — "sanitise it first"
without a named library is not a control.

## Sensitive operations — re-authentication

NFR-008 requires re-authentication for sensitive operations. Prompt for the
password again, or require a fresh MFA challenge, before:

- verifying or rejecting a payment
- issuing or revoking a certificate
- promoting a mentee to Mentor
- any role, permission, or tier-configuration change
- changing an email address or phone number
- viewing a member's payment proof file

Enforce it server-side. A client-side prompt is not a control.

## Payment verification

The manual payment flow is a trust boundary. Treat it accordingly.

- **Only Admins and Super Admins may verify or reject payments.** Members
  can submit proof; they cannot approve their own payment.
- **Record the reviewing admin.** `Payment` carries `reviewed_by`,
  `opened_by`, and `under_reviewed_at` so a concurrent-verification guard has
  something to compare. Without them, the guard in
  [payment-verification.md](../workflows/payment-verification.md) is
  unimplementable and the audit log is the only attribution.
- **Every verification and rejection writes an immutable audit log entry**
  with actor, old status, new status, and — on rejection — the reason.
- **Rejection requires a reason.** Never a bare reject. The member needs to
  know what to fix before resubmitting.
- **Approval activates an enrolment.** This is a money-adjacent action.
  Confirm the amount matches the tier price from `lib/pricing/` before
  verifying. An admin approving a mismatched amount is a revenue leak.
- **A rejected payment may be resubmitted** by transitioning the existing
  record back to `submitted`. Do not create a second payment, and do not
  clear the prior `rejection_reason` — the audit log is the record of what
  happened, and a `submitted` payment still carries the reason it was last
  rejected for.

## File uploads

Payment proof uploads are the main upload surface in Phase 1.

- Validate MIME type **and** magic bytes. Extension alone is not enough.
- Cap size (5MB for proof of payment).
- Store outside the web root. Serve via signed, expiring URLs.
- **Encrypt at rest** (SEC-004). Payment proofs are sensitive.
- Never trust the client-provided filename. Generate your own.
- Scan for malware before the file is served to an admin.
- Admins open these files. A malicious upload is an attack on staff.
- Log every access to a proof file. It is a member's financial document.

## Passwords and sessions

- argon2id. Never MD5, never SHA-256 alone, never plain.
- Session timeout on inactivity: 30 minutes for admins and 7 days for members,
  with a 30-day absolute cap (D-14; confirmed by the client on 2026-09-28).
- **Rotate the session ID on login and on privilege change** (elevation,
  role change) to prevent session fixation.
- **Invalidate all sessions on password change and on password reset.**
- Explicit revocation is a first-class operation, not a side effect of
  anything else.
- Cookies: `Secure`, `httpOnly`, `SameSite=Lax`, scoped `Path=/`. No tokens in
  `localStorage` or `sessionStorage`.
- **Rate limit with real numbers.** Confirmed baseline: 5 login attempts per 15
  minutes and 3 password-reset attempts per hour (D-14). Exponential backoff
  and lockout after 10 failures per account remain proposed unless separately
  approved. Centralize counters so every instance shares the applicable limit.
- Password reset tokens: single-use, short expiry (≤ 1 hour), invalidated on
  use, and compared in constant time.

## NDPA compliance — build it, don't bolt it on

Every feature touching personal data must address these:

- **Consent captured at registration** with version, text, timestamp, IP,
  user agent (SEC-011). Withdrawal must be possible without deleting the
  account — set `withdrawn_at`, never delete the row (SEC-012). This applies
  to *every* consent type including `data_processing`; if a withdrawal would
  make an account unusable, escalate it as a change request rather than
  removing the control.
- **Data subject requests** (access, rectification, erasure, restriction,
  portability, objection) are first-class records with status and handling
  notes (SEC-013).
- **Breach incidents** record detection time, affected count, risk level,
  and NDPC notification timestamps. The 72-hour window is tracked
  explicitly (SEC-014).
- **Audit logs are append-only** (SEC-015). Enforce at the database level,
  and revoke `TRUNCATE` and table ownership from the application role — a row
  trigger does not stop `TRUNCATE`.
- **Retention periods** defined per data category (SEC-016).
- **Sensitive data** (health data, payment proof) flagged as such (SEC-017).
- **Nigerian phone validation** — `+234` format (SEC-019). Normalise before
  validating so `+234 803 123 4567` is accepted and stored as
  `+2348031234567`. The regex lives once, in `lib/validation/`.
- **NGN default** on every monetary field (SEC-020).

Before marking any feature done, ask: does this need a consent type, a
retention policy, or an audit entry?

## Audit logging

Log two categories. Both are required; "changes member state" alone is not
enough.

**1. State changes:**

```ts
await audit({
  actorId,
  action: "payment.verify",
  entityType: "Payment",
  entityId: payment.id,
  oldValues: { status: "under_review" },
  newValues: { status: "verified" },
  ip,
  userAgent,
})
```

**2. Reads of member data by staff** (`member.read`, `member.paymentProof.read`,
`certificate.read`) — at minimum the actor, entity, and timestamp. The volume
matters more than the diff here; there is no diff on a read.

Covers at minimum: payment verify/reject, tier assignment, attendance
marking, completion marking, certificate issuance, mentor promotion, role
changes, permission changes, tier configuration, community link changes,
and member-data reads.

## Input handling

- Zod parse at every boundary. No exceptions.
- Prisma parameterises queries. Never raw SQL with interpolation. When raw SQL
  is unavoidable (the audit-log trigger), it is a migration, reviewed, with no
  interpolated user input.
- Escape all user content rendered as HTML. Prefer React's default escaping;
  only use `dangerouslySetInnerHTML` for admin-authored rich content, and
  sanitise it with a named sanitiser first.

## Secrets

- Environment variables only. Never in code, never in the repo.
- **Never prefix a secret with `NEXT_PUBLIC_`.** Next.js inlines
  `NEXT_PUBLIC_*` into the client bundle at build time. A database URL,
  session secret, or API key with that prefix is published to every browser.
- `.env.example` documents the shape with placeholder values and no real
  secrets. It is committed; `.env` is not.

