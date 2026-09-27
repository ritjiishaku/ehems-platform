---
name: testing
description: What to test, what to skip, tooling, and the definition of passing for EHEMS. Use when adding tests, deciding what deserves coverage, reviewing a diff for test quality, or checking whether a change is ready to merge. Pins the 17 business rules that must never regress.
---

# Testing Rules

Every skill in this repo says "add a test." This file defines what that
means: what to test, what to skip, what tooling, and what "passing" is.

PRD Appendix E sketches the QA approach — manual testing of user
journeys, cross-browser, mobile, payment workflow, role-based access,
NDPA field verification. This file makes that concrete.

## The principle

**Test business rules, not implementation.** A test that breaks when you
rename a variable is a liability. A test that breaks when you change the
attendance threshold from 60 to 55 is doing its job.

The PRD has 17 numbered business rules (§10) and a pricing table that
must hold to the naira. Those are the tests that matter. Everything else
is supporting work.

## Tooling

**The app is scaffolded.** Three runners are live, and `npm run verify` is the
gate that runs all of them plus the token pipeline:

```bash
npm test             # node:test — the token pipeline suite
npm run test:app     # Vitest + Testing Library — components, jsdom
npm run test:e2e     # Playwright — real Chromium, 375px + desktop
npm run build:tokens # regenerate styles/tokens.css (includes the contrast audit)
npm run check:tokens # fail if styles/tokens.css is stale
npm run typecheck    # tsc --noEmit, strict
npm run lint         # ESLint 9 flat config, typed for ts/tsx
npm run format       # Prettier write;  npm run format:check in CI
npm run verify       # check:tokens + typecheck + lint + format:check + test + test:app
npm run build        # next build — also required before test:e2e
```

**Playwright always runs against a production build** (`next build && next start`,
in CI and locally). Dev serves unminified bundles plus the HMR client and measured
~852 KB against ~188 KB for the real build, so any bandwidth assertion run
against dev is not a bandwidth assertion at all. It also never reuses an
already-listening server, because a leftover `next start` has the old build in
memory and would test stale code. Stop anything on port 3000 before running
`test:e2e`, or expect a port conflict.

**Do not format generated artifacts.** `styles/tokens.css` is compared
byte-for-byte by `check:tokens`; if Prettier rewrites it the staleness gate fails
and `verify` can never pass. `.prettierignore` excludes it — keep it that way.

### Accessibility testing, and its two halves

This is the one place where the two runners are not interchangeable, and getting
it wrong produces a green test that asserts nothing.

- **jsdom has no canvas.** axe-core computes `color-contrast` by rasterising text
  onto a canvas, so under jsdom that rule always returns as *incomplete* ("Axe
  encountered an error"), never as a violation. A passing Vitest axe run says
  nothing about contrast — `test/helpers/axe.ts` documents this.
- **Chromium has canvas.** The Playwright axe run is the only place contrast is
  genuinely evaluated against rendered pixels. It asserts that `color-contrast`
  is *not* in `incomplete`, so an undecidable run cannot be reported as a pass.
- **The authoritative contrast check is `scripts/build-tokens.js`**, which audits
  all 102 role pairs against WCAG AA at build time. Deterministic, and it covers
  the whole palette, not just what one page happens to render.

`vitest-axe@0.1.0` ships an empty `dist/extend-expect.js` and declares
`toHaveNoViolations` as `export type`, so its matcher can neither auto-register
nor be typed. `test/helpers/axe.ts` calls `axe()` directly and throws on a
non-empty violation list. Do not reintroduce the matcher import.

**Test the gate itself.** `test/landing-page.test.tsx` asserts that
`expectNoAxeViolations` rejects an image with no `alt`, and the lint guard rails
were proven by probing a file with hex literals and an arbitrary `className`
value. A guard rail that cannot fail is worse than no guard rail.

One test file per module, colocated:

```
lib/pricing/calculateTierPrice.ts
lib/pricing/calculateTierPrice.test.ts
```

## What to test

### Tier 1 — non-negotiable

Every one of these must have a test that fails if the rule is broken:

- **The four pricing examples in [architecture.md](architecture.md).** These
  pin BR-003, BR-004, BR-005, and BR-007 simultaneously. BR-003 in particular
  is *list price minus list price*, never amount paid minus amount paid — the
  ₦450,000 upgrade example must assert the difference of the two official
  prices, so a refactor to "amount actually paid" fails loudly. If any of
  them regresses, the client loses money.
- **Tiers II, VI, VII never render.** Query-level filter, tested at the
  query level and at the component level. BR-016.
- **Payment state machine transitions.** Every valid transition succeeds;
  every invalid transition throws. The five states from §14.3.
- **Completion requires all five conditions.** BR-008. A member with 59%
  attendance is not complete. A member with 61% but an unfinished
  checklist is not complete.
- **Payment and enrolment are separate.** FR-029. Verifying a payment
  activates an enrolment; failing to verify does not.
- **Audit log rejects UPDATE and DELETE.** At the database level. SEC-015.
- **Consent is captured at registration** with version, text, IP, UA.
  SEC-011.
- **`ProgressBar` marks the programme's threshold, not a hardcoded 60%.** A
  programme with an 80% threshold must not mark eligibility at 60%.

### Tier 2 — expected

- Every Zod schema rejects malformed input and accepts valid input.
- Every route handler returns the right HTTP code for auth failures:
  401 for no session, 403 for wrong role, 403 for wrong owner.
- Every state-changing route writes an audit log entry.
- Every notification writes a `Notification` row.
- Every list query excludes retired tiers.
- Every personal-data entity has a `RetentionPolicy` row in the seed.

### Tier 3 — nice to have

- Component render tests with representative props.
- Empty, loading, and error states for lists.
- Accessibility assertions via `vitest-axe` under Vitest for structure and ARIA,
  and via `@axe-core/playwright` in Chromium for anything involving rendered
  colour. See §Accessibility testing.

## What not to test

- **Snapshots.** They fail on unrelated changes and get blindly updated.
  Assert on visible text and behaviour instead.
- **Implementation details.** Do not test that `useState` was called, or
  that a specific function ran. Test the observable outcome.
- **Third-party libraries.** Do not test that Prisma saves a row. Test
  that _your function_ returns the right result.
- **Exact HTML structure.** Class names change. `getByRole` and
  `getByText` are stable; `querySelector('.rounded-lg')` is not.
- **Coverage percentage as a goal.** 100% coverage with weak assertions
  is worse than 60% coverage of the rules that matter.

## Test data

### Fixtures over factories over mocks

Prefer a real database with real rows over mocks. The business rules are
about data relationships — mocking the data layer means testing the mock.

```ts
// Good — real rows, real relationships
const member = await createTestMember({ tier: 'basic', paid: true })
const result = calculateUpgradeDifference('basic', 'advanced_iv', member)
expect(result).toBe(45_000_000) // ₦450,000

// Bad — mocks the thing under test
vi.mock('@/lib/db', () => ({ ... }))
```

Note the argument order: `(fromTier, toTier, member)`, matching the signature
in [architecture.md](architecture.md). Money is kobo — `45_000_000`, never
`45_000_00`, which is a factor of ten away and reads as a plausible number,
which is exactly why it survived review.

`createTestMember` is a test helper that does not exist yet. Define it once in
`test/helpers/` when the app lands, and give it named options rather than
positional booleans — `createTestMember({ paid: true, completed: true })` is
self-documenting, `createTestMember(true, true)` is not.

### The seed is a fixture

`prisma/seed.ts` produces the canonical tiers, certificates, roles, system
settings, and retention policies. Tests run against a database seeded from it.
**If the seed is wrong, every test that depends on it is wrong.** That is why
the seed gets its own test:

- Six tiers exist, with correct `displayOrder` and kobo prices, named exactly
  as PRD §11.1 (including "Level").
- Tiers II, VI, VII do not exist.
- The certificate catalogue matches PRD §11.3.
- All **eleven** roles from PRD §4.1 exist, each with its permissions. Seeding
  four (as PRD §5.1 implies) makes Staff/Content Manager, Show Viewer,
  Programme Participant, and Event Participant unrepresentable.
- `SystemSetting` and a `RetentionPolicy` per personal-data category exist.

### Isolation

Each test file gets a clean database state. **Use a transaction that rolls
back per test file — do not truncate.** `AuditLog` is append-only and
database-enforced (SEC-015); `TRUNCATE` bypasses row-level triggers and would
silently destroy the compliance record the tests are meant to protect. Seed
once, wrap each file in a rolled-back transaction, and where a test must
commit, clean up by deleting the specific rows it created in dependency order
— `AuditLog` excluded.

**Do not share mutable state between tests** — order-dependent tests are flaky
tests.

## Money tests

Every monetary assertion uses kobo integers, never naira floats.

```ts
// Correct
expect(price).toBe(37_500_000); // ₦375,000

// Wrong — float arithmetic will bite
expect(price).toBe(375000.0);
```

The `Kobo` branded type in [code-style.md](code-style.md) is a compile-time
aid over `number` and proves nothing at runtime. The kobo-integer convention
is enforced by these assertions and by the lint rule — not by the type.

The pricing table from [architecture.md](architecture.md) is transcribed
directly into test cases. If someone changes a price in `lib/pricing/`, the
test fails and they must consciously update both.

## Payment verification tests

The admin verification flow
([payment-verification.md](../workflows/payment-verification.md)) has its own
required test list. Do not consider it built without:

- `openForReview()` transitions `submitted → under_review`
- A second `openForReview()` on the same payment returns 409
- `verifyPayment()` activates the enrolment and writes the audit entry,
  **in one transaction**
- `verifyPayment()` on a non-`under_review` payment returns 409
- `rejectPayment()` requires a reason of at least 10 characters
- Rejection does not delete the payment or deactivate the enrolment
- Resubmission preserves the rejection in the audit log
- A failed activation rolls back the status change
- The notification fires **after** commit, not inside the transaction
- **An Admin CAN verify** (positive case) — Member gets 403, anonymous gets
  401. Testing only the denials leaves the primary authorisation path
  unasserted.
- The reviewing admin is recorded and appears in the audit log.

## NDPA compliance tests

See [ndpa-compliance/SKILL.md](../skills/ndpa-compliance/SKILL.md) for the full
list. At minimum:

- Registration writes a `ConsentRecord` with all required fields
- Consent withdrawal sets `withdrawn_at` and does not delete the row
- Re-consent creates a new row, does not update the old
- Marketing consent can be declined without blocking registration
- `data_processing` withdrawal is reachable from the UI without deleting the
  account (SEC-012)
- Erasure anonymises but preserves financial records
- Erasure does not delete `AuditLog` rows
- `AuditLog` UPDATE and DELETE raise at the database level

## End-to-end journeys

Playwright covers journey 0 today and the four journeys in PRD §8 as the app
grows:

0. **Visitor sees the landing page.** Hero value proposition and CTA above the
   fold at 375px; the Get started CTA resolves to a real target; no axe
   violations; reflows to 320px; first load inside the bandwidth budget.
1. **Visitor → Free Member.** Sign up, land on dashboard, see O'Free tier.
2. **Free → Paid Member.** Select a tier, submit payment proof, admin
   verifies, tier activates, community link appears.
3. **Paid → Completed → Certificate.** Admin marks attendance and completion,
   issues certificate, member downloads it.
4. **Admin payment verification.** Queue shows submitted payment, admin opens
   it, approves, member's dashboard updates.

Run journeys 1–3 at **375px as an automated gate**, not a manual pass — that
viewport is the primary target and a manual check is the step that gets
skipped. Journeys 4 and the cross-browser matrix below can stay manual.

## Role-based access tests

Every protected route is tested against:

- No session → 401
- Wrong role → 403
- Right role, wrong owner → 403
- Right role, right owner → 200

This is mechanical and repetitive, which is exactly why it gets skipped
and exactly why it should not. Authorisation bugs are the most common
and most damaging class in an app like this.

## Cross-browser and device testing

Automated in Playwright where possible; manual for the rest.

- Chrome, Firefox, Safari, Edge (Appendix E)
- Android Chrome at 375px — the primary target, automated
- iOS Safari at 390px

Automation runs on Chrome and Firefox. Safari and iOS get a manual pass before
each milestone. Do not claim Safari or mobile is covered until it is.

## What "passing" means

A change is ready when:

1. `npm run verify` passes — typecheck, lint, format, and both unit suites
2. `npm run test:e2e` passes against a production build
3. `npm run build` succeeds
4. New business rules have new tests that fail without the change
5. No existing test was modified to make a failing test pass — if a test
   needed changing, the rule it pinned changed, and that needs a reason

Point 5 is the important one. A diff that only weakens tests is a
regression dressed up as progress. If a test is genuinely wrong, fix it
**and** explain why in the commit message.

## Flaky tests

A test that fails intermittently is worse than no test — it trains people
to ignore failures.

- **Never retry-loop a flaky test into passing.** Fix the cause.
- Common causes: shared database state, timing assumptions, `setTimeout`
  in tests, unordered query results.
- If a test depends on time, inject the clock. Do not use `Date.now()`
  directly in code under test.
- If a test depends on order, the test is wrong — make it self-contained.

## Anti-patterns

1. **Asserting on implementation.** Test the outcome, not the call.
2. **Snapshot sprawl.** Delete snapshots. Use `getByRole`.
3. **Mocking the thing under test.** You are testing the mock.
4. **Shared mutable fixtures.** Tests must run in any order.
5. **Skipping auth tests.** Every route, every role. No exceptions.
6. **Testing that a rule "works" without testing that it "fails".**
   `verifyPayment()` activating an enrolment is half the test. The other
   half is that it does _not_ activate on a non-`under_review` payment.
7. **Weakening an assertion to make it pass.** See point 6 above.
8. **Ignoring the seed.** The seed is a fixture. Test it.
9. **Asserting a rule the example does not exercise.** If a test claims to pin
   a BR, make sure the assertion would fail if that BR were broken.

## Done when

- [ ] New business logic has tests that fail without the change
- [ ] New routes have auth-failure tests, including the positive case
- [ ] New state changes have audit-log assertions
- [ ] New personal-data paths have compliance assertions
- [ ] No existing test was weakened without a stated reason
- [ ] No snapshot tests added
- [ ] No PII in test output
- [ ] `npm run verify` passes
- [ ] `npm run test:e2e` passes against a production build
- [ ] Any new accessibility assertion is honest about which runner can actually
      decide the rule (see §Accessibility testing)

