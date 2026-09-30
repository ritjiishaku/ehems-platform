---
name: api-route-scaffolder
description: Scaffold or review a Next.js App Router route handler for EHEMS — authorisation order, validation, response envelope, HTTP status codes, audit logging, and payment-route delegation. Use when adding an API route, or checking one for auth gaps, status-code errors, or leaked business logic.
---

# API Route Scaffolder

## The shape every route follows

```
1. Authorise → requireSession / requireRole / ownership check
2. Parse     → Zod schema from lib/validation
3. Delegate  → call a lib/ function. No business logic here.
4. Serialise → consistent response envelope
5. Audit     → if it changes state
```

**Authorise before you parse.** An unauthenticated caller should not be able
to force body allocation on the server. Validate `Origin` on any non-GET
request — see the CSRF section of
[security.md](../../rules/security.md).

If you find yourself writing business rules in step 3, stop. They belong
in `lib/`.

## Template

```ts
// app/api/payments/submit-proof/route.ts
import { NextRequest } from "next/server";
import { submitProofSchema } from "@/lib/validation/payments";
import { requireSession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { submitProof } from "@/lib/payments/transitions";
import { badRequest, ok, serverError } from "@/lib/http";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    assertSameOrigin(req);

    const raw: unknown = await req.json();
    const parsed = submitProofSchema.safeParse(raw);
    if (!parsed.success) return badRequest(parsed.error);

    const result = await submitProof({
      userId: session.userId,
      ...parsed.data,
    });

    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}
```

## Response envelope

Always the same shape. Clients depend on it.

```ts
// success
{ "data": { ... } }

// error
{ "error": { "code": "VALIDATION_FAILED", "message": "...", "fields": {...} } }
```

Never return a bare array. Never return a bare string.

## HTTP codes

| Code | When                                                       |
| ---- | ---------------------------------------------------------- |
| 200  | Success (GET, PATCH)                                       |
| 201  | Created (POST that creates)                                |
| 400  | Validation failed                                          |
| 401  | No session                                                 |
| 403  | Session, but wrong role or not the owner                   |
| 404  | Not found — **or when existence is itself private**        |
| 409  | State conflict (e.g. a payment already under review)       |
| 422  | Business rule violated with a valid shape                  |
| 429  | Rate limited                                               |
| 500  | Unexpected                                                 |

Use 404 rather than 403 where revealing existence would leak information.

`ConflictError` from `lib/` maps to 409 and `ValidationError` to 422. That
mapping lives in `lib/http/` so it is defined once.

## Authorisation

```ts
await requireSession(); // 401 if none
await requireRole(session, ["admin"]); // 403 if wrong role
await requireOwnership(session, resource); // 403 if not the owner
```

**Five assignable roles only** (D-3, confirmed by the client 2026-09-28):
`visitor`, `member`, `mentor`, `admin`, `super_admin`. Everything else in PRD
§4.1 — `customer`, `programme_participant`, `event_participant`,
`internship_applicant`, `show_viewer`, `staff` — is *derived* from account or
domain state, not an independently assignable role, so it is not a `Role` row
and not something a route checks for. `isRoleKey` rejects keys outside the
catalogue, which is what stops a legacy row from granting anything.

**Super Admin only:** tier configuration, role assignment, **mentor
promotion**, and permission changes. Mentor promotion is the one role change
that creates platform-wide capability and is easy to forget.

Check **permissions**, not only roles, where the PRD §4.2 matrix is
finer-grained than the role — use `lib/permissions/`. Prefer
`hasPermission(principal, key)` over `requireRole(...)` whenever §4.2 has a row
for the action, so the matrix stays the single authority. A direct `requireRole`
is only correct when §4.2 defines *no* row (see D-18 for the data-subject
requests case, which is the current example).

## Validation

- Schema lives in `lib/validation/`, shared with the client form.
- Parse `body`, `query`, and `params` — all three.
- **Never trust a client-supplied amount, price, or status.** The client
  sends IDs; the server looks up values from `lib/pricing/`.
- **Schemas check shape, not business rules.** "Rejection reason ≥ 10 chars"
  and "attendance threshold ≥ 60" belong in `lib/`, not in a schema that
  ships to the client.
- Nigerian phone: import the shared regex from `lib/validation/` — it is
  defined once there, normalises spaced input, and must not be duplicated.
- Money, where a schema genuinely must carry it: integer kobo,
  `.int().positive()` with an upper bound. `.nonnegative()` admits ₦0, which
  is not a valid `Payment`. In practice no route should accept an amount at
  all.

## State changes

Any route that changes state must:

1. Wrap multi-row writes in `prisma.$transaction`.
2. Write an audit log entry — for state changes *and* for reads of member
   data by staff.
3. Trigger notifications **after** commit, never inside the transaction.

## Payment routes specifically

All payment routes delegate to `lib/payments/transitions`. Never touch
`Payment.status` directly.

- **Member submits proof** → `submitProof()`. Requires ownership of the
  payment. Moves `pending` → `submitted`.
- **Admin opens for review** → `openForReview()`. Requires the §4.2
  `payment.verify` grant. Sets `under_review`, records `opened_by`.
- **Admin approves** → `verifyPayment()`. Requires the `payment.verify` grant.
  Sets `verified` and calls `activateEnrolment()` in the same transaction.
- **Admin rejects** → `rejectPayment()`. Requires a reason. Sets `rejected`.
- **Member resubmits** → `resubmitProof()`. Requires ownership. Moves
  `rejected` → `submitted` on the **same row**, keeping `rejection_reason`
  until the payment is eventually verified (D-8). Never a second `Payment`.

The client sends `paymentId` and proof details. **Never accept an amount
from the client.** The amount is fixed at creation from `lib/pricing/`.

Verification and rejection are sensitive operations — require
re-authentication first (NFR-008, see
[security.md](../../rules/security.md)).

## Rate limiting

Apply to login, register, password reset, proof submission, and feedback
submission — the auth endpoints plus the two unauthenticated-ish write
surfaces. Not to plain reads. Use the shared limiter in
`lib/auth/rateLimit.ts` and the numbers in
[security.md](../../rules/security.md); do not invent a per-route limit.

## Do not

- Do not put business logic in the handler.
- Do not put business rules in a Zod schema.
- Do not mutate `Payment.status` outside `lib/payments/`.
- Do not skip authorisation because the UI hides the action.
- Do not return internal error messages to the client.
- Do not log PII into the error response — log it server-side with a
  correlation ID.

