# Workflow: New API Route

Use when adding an endpoint under `app/api/`.

## Steps

1. **Check the PRD.** Is this endpoint in §17.1? If it's for a deferred
   feature — see the full fence in
   [architecture.md](../rules/architecture.md) — stop and raise a change
   request.

2. **Define the contract.** Write the Zod schema in `lib/validation/`
   first. Input shape, output shape, error cases. Shape only — business
   rules belong in `lib/`, not in a schema that ships to the client.

3. **Determine authorisation.** Who can call this?
   - Public → still rate-limit if it writes
   - `requireSession()` for anything member-scoped
   - `requireRole(['admin'])` for operational actions
   - `requireRole(['super_admin'])` for tier config, role assignment, and
     **mentor promotion**
   - Ownership check separately from role check
   - `lib/permissions/` where PRD §4.2 is finer-grained than the role

4. **Write the `lib/` function.** Business logic goes here, not in the
   handler. Load the `api-route-scaffolder` skill for the template.

5. **Scaffold the handler.** Authorise → parse → delegate → serialise.
   Authorise *first*, so an unauthenticated caller cannot force body
   allocation. Validate `Origin` on any non-GET request. Parse all three of
   body, query, and params.

6. **Handle state changes.**
   - Multi-row writes → `prisma.$transaction`
   - Audit log entry for anything that changes member state, **and for
     reads of member data by staff**
   - Notifications **after** commit via `dispatchAsync`, never awaited
     inside the transaction

7. **Map errors.** Typed errors from `lib/` → HTTP codes via `lib/http/`.
   Generic message to the client, detail to the logs, correlation ID in both.

8. **Rate limit** if it is auth, proof submission, or feedback, using the
   shared limiter and the numbers in
   [security.md](../rules/security.md).

9. **Test.**
   - Happy path
   - Validation failure → 400
   - No session → 401
   - Wrong role → 403
   - Not the owner → 403
   - **The positive case: the authorised role CAN do it**
   - Business rule violation → 409 or 422

10. **Verify.**
    ```bash
    npm run verify
    ```
    Add `npm run typecheck` and `npm run lint` once those scripts exist.

## Payment routes — extra checks

All payment routes delegate to `lib/payments/transitions`. Never mutate
`Payment.status` from a handler.

- Member-submitted routes require ownership of the payment record.
- Admin verification and rejection require `admin` or `super_admin`, and
  **re-authentication first** (NFR-008).
- **Verification confirms the amount matches the tier price** from
  `lib/pricing/` before approving. An admin waving through a mismatched
  amount is a revenue leak.
- Rejection requires a reason and preserves the original record — the member
  resubmits against the same payment row via `resubmitProof()`. Do not clear
  the prior `rejection_reason`.
- Verification calls `activateEnrolment()` in the same transaction as the
  status change. Never as a follow-up step that can fail independently.
- Every transition writes an audit log entry with actor and old/new status.

## Done when

- [ ] Zod schema in `lib/validation/`, shared with the client, shape only
- [ ] Authorisation enforced server-side, before parsing
- [ ] `Origin` validated on non-GET requests
- [ ] Business logic in `lib/`, not the handler
- [ ] Transaction + audit log for state changes
- [ ] Error responses use the standard envelope
- [ ] Tests cover the auth and validation failure paths, including the
      positive case
- [ ] `npm run verify` passes
