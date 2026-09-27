# Workflow: Payment Verification

Use when building or modifying anything in the admin verification queue —
the screen where an Admin reviews a member's proof of payment and decides
whether to activate their tier.

This is the system's main trust boundary. A mistake here either leaks
revenue (approving too much) or blocks a paying member (approving too
little). Both are expensive.

## The state machine you're operating

```
submitted ──admin opens──▶ under_review ──┬──▶ verified  (activates enrolment)
                                          │
                                          └──▶ rejected  (reason required;
                                                         member may resubmit)
```

`submitted` is set by the member when they upload proof. Your workflow
covers everything from there.

## Step 1 — The queue

The admin queue is a list of payments where `status = 'submitted'`, oldest
first. Default sort is `submittedAt ASC` — longest-waiting member first.
Never sort by amount.

Each row shows:

- Member name and email
- Tier they're paying for
- Amount expected (from `lib/pricing/`, not from the payment record)
- Amount declared by the member
- Transfer date
- Time waiting
- A single "Review" action

Do not show the proof image inline in the list. It's sensitive, and
loading every proof to render a list is wasteful on 3G.

## Step 2 — Open for review

Clicking "Review" calls `openForReview(paymentId, adminId)`:

- Validates current status is `submitted`
- Sets status to `under_review`
- Records `opened_by` and `under_reviewed_at` — the attribution the
  concurrency guard and the audit trail both depend on
- Writes an audit log entry

**This transition matters.** It removes the payment from other admins'
queues, preventing two admins from acting on the same payment. Without
it, you get duplicate activations and confused members.

If the current status is anything other than `submitted`, the transition
fails with a 409. Surface this as "This payment has already been picked
up by another admin" rather than a raw error.

Both this step and Steps 5a/5b are sensitive operations — prompt for
re-authentication before the action (NFR-008, see
[security.md](../rules/security.md)).

## Step 3 — The review screen

The admin sees, side by side:

**Left — what the member claims**

- Amount declared
- Payment method (bank transfer / mobile money / cash)
- Payment reference
- Bank name
- Transfer date
- Proof of payment (image or PDF, rendered inline)

**Right — what the system expects**

- Tier being purchased
- Expected amount, from `lib/pricing/calculateTierPrice()`
- Whether this is an upgrade (and if so, the difference calculation)
- Member's current tier, if any
- Member's payment history

**The admin's job is to reconcile these two columns.** The system does
not do it automatically — that's the point of manual verification.

## Step 4 — Checks before approving

Before calling `verifyPayment()`, the admin must confirm:

1. **Amount matches.** Declared amount equals expected amount. If this is
   an upgrade, the expected amount is the _difference_, not the tier price.
2. **Reference is not reused.** The payment reference hasn't already been
   used on another verified payment. This is a common fraud vector — one
   transfer receipt submitted for two different tiers.
3. **Transfer date is recent.** Not a hard rule, but a 6-month-old receipt
   is a red flag. Flag for review rather than auto-rejecting.
4. **Proof is legible.** The admin must actually be able to read the
   receipt. If it's blurry or cropped, reject with reason "Proof is not
   legible — please re-upload a clear photo."
5. **Proof matches the declared details.** Bank name, amount, reference,
   date on the receipt should match what the member typed.

If any check fails, **reject rather than approve**. Rejection is
reversible (the member resubmits). An incorrect approval is not.

## Step 5a — Approving

`verifyPayment(paymentId, adminId)` runs in a single transaction:

```ts
await prisma.$transaction(async (tx) => {
  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    include: { enrolment: true },
  });

  // Guard: status must still be under_review
  if (payment.status !== "under_review") {
    throw new ConflictError("Payment is no longer awaiting review");
  }

  await tx.payment.update({
    where: { id: paymentId },
    data: {
      status: "verified",
      verifiedAt: new Date(),
      verifiedBy: adminId,
    },
  });

  await activateEnrolment(tx, paymentId);

  await audit(tx, {
    actorId: adminId,
    action: "payment.verify",
    entityType: "Payment",
    entityId: paymentId,
    oldValues: { status: "under_review" },
    newValues: { status: "verified" },
  });
});

// After commit — never inside the transaction, and never awaited on the
// request path. Verification fires TWO notifications; a member who gets only
// the payment email and not the tier activation is a support ticket.
dispatchAsync("payment_verified", payment.userId, { paymentId: payment.id });
dispatchAsync("tier_activated", payment.userId, { enrolmentId: enrolment.id });
```

**All four steps are one transaction.** If activation fails, the status
change rolls back. If the audit fails, the activation rolls back. There
is no partial state.

**Notifications happen after commit.** Sending an email inside the
transaction means a slow mail provider holds the DB lock, and a failed
send rolls back a legitimate payment. See
[email-notification/SKILL.md](../skills/email-notification/SKILL.md).

## Step 5b — Rejecting

`rejectPayment(paymentId, adminId, reason)` runs in a single transaction:

```ts
await prisma.$transaction(async (tx) => {
  const payment = await tx.payment.findUnique({ where: { id: paymentId } });
  if (payment.status !== "under_review") {
    throw new ConflictError("Payment is no longer awaiting review");
  }

  await tx.payment.update({
    where: { id: paymentId },
    data: {
      status: "rejected",
      rejectionReason: reason,
    },
  });

  await audit(tx, {
    actorId: adminId,
    action: "payment.reject",
    entityType: "Payment",
    entityId: paymentId,
    oldValues: { status: "under_review" },
    newValues: { status: "rejected", reason },
  });
});

dispatchAsync("payment_rejected", payment.userId, {
  paymentId: payment.id,
  reason,
});
```

**The reason is mandatory.** The member needs to know what to fix. Enforce
the minimum length in `lib/payments/` (`rejectPayment` rejects a reason
shorter than 10 characters) — not in a Zod schema. A schema that ships to
the client discloses the rule and can be bypassed; the authority is the
`lib/` function the route delegates to. The client-side field still gets a
matching `min(10)` for UX, and both are tested.

The rejection reason should be one of a small set of canned options, plus
a free-text field:

- "Amount received does not match tier price"
- "Payment reference already used on another tier"
- "Proof of payment is not legible — please re-upload"
- "Details on receipt do not match the information provided"
- "Transfer not found in bank statement"
- Other (free text)

Canned reasons mean consistent member experience and cleaner support.

## Step 6 — Resubmission after rejection

A rejected payment is **not deleted**. The member sees it in their payment
history with the rejection reason, and a "Resubmit proof" action.

**Use the same `Payment` record — transition it back to `submitted`.**
Do not create a new row. The member paid once; they're retrying the same
payment, and one row per purchase intent keeps their history readable.

The audit log preserves both the rejection and the resubmission. A member
who is rejected three times has three rejection entries in the audit
trail and one `Payment` row that has cycled
`submitted → under_review → rejected` three times.

**Never clear the rejection reason on resubmission.** The row keeps the
reason it was last rejected for, and the audit log holds every prior value.
The member-facing view distinguishes "rejected, awaiting resubmission" from
"resubmitted" by status, not by the presence of a reason string.

## Edge cases the agent will hit

| Case                                      | Handling                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Amount overpaid                           | Reject with reason; admin arranges refund offline. Never auto-credit overpayment as a future discount.              |
| Amount underpaid                          | Reject with reason stating the shortfall. Member can top up and resubmit, or pay the difference separately.         |
| Payment for a tier the member already has | Reject. Check `enrolment` status before approving.                                                                  |
| Payment for a tier _lower_ than current   | Reject. Downgrades are not supported.                                                                               |
| Member upgrades mid-review                | Reject the old payment with reason "Tier changed — please submit for the new tier." The old enrolment has moved on. |
| Duplicate proof (same reference)          | Reject the newer one. Reference uniqueness is checked at approval, but flag it in the UI too.                       |
| Admin verifies, then immediately regrets  | No un-verify. Issue a manual refund offline and record an audit entry. Do not reverse the status.                   |
| Two admins open the same payment          | The second `openForReview()` fails with 409. Surface a friendly message.                                            |
| Member cancels while under review         | Member-side cancellation is not a Phase 1 feature. If it's needed, it's a change request.                           |

## What the member sees

The member's payment history shows every payment with its current status,
rendered by `StatusChip`. On rejection, the rejection reason is shown in
full, plus a "Resubmit" CTA.

**Never show the member the admin's name.** Anonymity reduces friction on
rejection and protects staff from being contacted directly.

**But the reason is shown verbatim, and the two rules can conflict.** An
admin's free-text reason can contain their own name. Resolve it like this:

- Canned reasons are shown as-is — they are admin-authored but contain no
  identifying text.
- Free-text reasons are **rendered verbatim** to the member (the member is
  owed the actual reason), and the admin-facing UI warns the author before
  submitting: *"Do not include your name or contact details — the member
  sees this."*
- Do not silently rewrite or strip the reason. The audit log holds exactly
  what was submitted, and altering member-facing text post hoc is its own
  integrity problem.

On approval, the member receives:

- An in-app notification
- An email (FR-057)
- Updated dashboard showing the new tier active
- Community link unlocked, if the tier grants access

## What to test

- [ ] Queue sorts by `submittedAt ASC`
- [ ] `openForReview()` sets `under_review`, records `opened_by`, and blocks
      a second admin
- [ ] `verifyPayment()` activates enrolment and writes audit log
- [ ] `verifyPayment()` on a non-`under_review` payment returns 409
- [ ] `rejectPayment()` requires a reason of at least 10 characters
- [ ] Rejection does not delete the payment record
- [ ] Rejection does not deactivate the enrolment
- [ ] Resubmission preserves the rejection in the audit log
- [ ] Resubmission does not clear `rejection_reason` on the row
- [ ] Notification fires after commit, not before
- [ ] Verification fires **both** `payment_verified` and `tier_activated`
- [ ] A failed activation rolls back the status change
- [ ] Overpayment and underpayment both reject cleanly
- [ ] Reused reference is caught at approval
- [ ] **An Admin CAN verify** (positive case); Member gets 403; anonymous
      request returns 401
- [ ] The reviewing admin is recorded and appears in the audit log

## Common mistakes

1. **Approving without checking the amount.** The most expensive mistake
   in this workflow. Always reconcile before calling `verifyPayment()`.
2. **Auto-approving on submission.** Defeats the purpose of manual
   verification. Do not build this.
3. **Deleting rejected payments.** Destroys the audit trail and the
   member's ability to see what went wrong. Never delete.
4. **Notifying inside the transaction.** Holds DB locks on external
   I/O, and rolls back legitimate state changes when the mail provider
   hiccups.
5. **Splitting status change and activation into two operations.** They
   must be atomic, or you get orphaned enrolments and payments that say
   verified but grant nothing.
6. **Storing the verification decision without an audit entry.** SEC-007
   requires it. There is no exemption.

## Done when

- [ ] Queue renders correctly at 375px
- [ ] All transitions implemented in `lib/payments/transitions.ts`, including
      `resubmitProof()`
- [ ] `verifyPayment()` calls `activateEnrolment()` in the same transaction
- [ ] Every action writes an audit log entry, including reads of member data
- [ ] Rejection reason is mandatory and surfaced to the member
- [ ] Notifications fire after commit, both of them, unawaited
- [ ] All edge cases above tested
- [ ] `npm run verify` passes
