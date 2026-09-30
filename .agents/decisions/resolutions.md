# EHEMS Phase 1 Open Decisions: Resolutions

This document resolves the 17 open decisions for EHEMS Phase 1. 
- **6 items** are resolved as `TECHNICAL` (we have chosen the correct architectural or mechanical answer).
- **8 items** are classified as `CLIENT` (they change entitlements, pricing, or scope, and require sign-off).
- **3 items** are `DEFERRED` to later phases.
As a result of the 8 `CLIENT` items, Phase 2B, Phase 6, Phase 8, Phase 9, Phase 10, and Phase 11 remain blocked pending client answers.

---

## D-1 — O'Free can never activate
**Class:** `CLIENT`
**Decision:** [RECOMMENDED — awaiting sign-off] Activate O'Free enrolments immediately upon registration without a payment record.
**Rationale:** BR-001 bases activation on payment verification, but O'Free has no payment. Creating a ₦0 payment pollutes financial records. Automatically activating a zero-cost tier maintains the payment-enrolment separation (§17.3) while satisfying AC-001 (free tier access). (Resolved before D-4 as the activation model constrains enrolment).
**Changes required:**
- Update `lib/payments/activateEnrolment.ts` to bypass payment verification for ₦0 tiers.
- Add tests asserting O'Free instant activation.
**Blocker for:** Phase 8 (Payments), Phase 9 (Member dashboard).
**Entangled with:** D-4.

## D-2 — Discounted prices are unmodelled and shown unconditionally
**Class:** `CLIENT`
**Decision:** [RECOMMENDED — awaiting sign-off] Show list prices on the public marketing site, and reveal the 50% discount in the member dashboard checkout only for eligible members.
**Rationale:** §11.1 lists discounted prices, but BR-005 restricts them to first-time Advanced buyers. Showing a public discount that a returning member won't receive violates consumer protection. (Resolved before D-8 to ensure the purchase intent captures the right amount).
**Changes required:**
- Remove discounted prices from the public `/pricing` page.
- Add `PricingMember` eligibility checks to the dashboard checkout flow.
**Blocker for:** Phase 3 (Pricing page), Phase 7 (Display).
**Entangled with:** D-8.

## D-3 — Four roles or eleven?
**Class:** `TECHNICAL`
**Decision:** Implement 5 genuine RBAC roles (`visitor`, `member`, `mentor`, `admin`, `super_admin`) and derive the remaining states from data.
**Rationale:** The PRD §4.1 conflates RBAC roles with user states. `Customer`, `Programme Participant`, `Event Participant`, and `Show Viewer` are states derived from active records (orders, enrolments, event tickets). `Internship Applicant` is Phase 2. `Staff` merges cleanly with `admin`. This matches the 5-column permission matrix in §4.2 perfectly. (Resolved before D-12 to simplify permissions).
**Changes required:**
- Update `prisma/seed.ts` to seed only the 5 RBAC roles.
- Update `AGENTS.md` §3 to reflect 5 roles.
**Blocker for:** Phase 2B (Schema), Phase 6 (RBAC).
**Entangled with:** D-12.

## D-4 — Enrolment cannot model programme access
**Class:** `CLIENT`
**Decision:** [RECOMMENDED — awaiting sign-off] Remove `programme_id` from `Enrolment` and use a many-to-many `EnrolmentProgramme` join table with per-programme attendance thresholds.
**Rationale:** §16.2 models a singular `programme_id` on `Enrolment`, but §16.7 allows multiple programmes per tier. One enrolment cannot span N programmes. Since D-1 grants O'Free users access to community programmes, they need a way to track attendance across multiple programmes.
**Changes required:**
- Add `EnrolmentProgramme` to `schema.prisma`.
- Remove `programme_id` from `Enrolment`.
- Update workflows and `lib/` to query programme access via the new join.
**Blocker for:** Phase 2B (Schema), Phase 8, 9, 10, 11.
**Entangled with:** D-1, D-13.

## D-5 — Certificate counts do not reconcile
**Class:** `CLIENT`
**Decision:** [RECOMMENDED — awaiting sign-off] Correct the top-line claim to "27 certificates" to match the catalogue in §11.3, and require the client to supply the specific per-tier certificate mapping.
**Rationale:** §5.1 claims "30+", §11.3 lists exactly 27, and the tier table claims 76+ total slots. The catalogue is the only concrete list. We cannot proceed without the client defining exactly which of the 27 certificates belong to which tier.
**Changes required:**
- Update marketing copy to 27 certificates.
- Seed the `MemberCertificate` catalogue once the tier mapping is provided.
**Blocker for:** Phase 2B (Schema), Phase 11 (Certificates).
**Entangled with:** None.

## D-6 — No Material entity
**Class:** `CLIENT`
**Decision:** [RECOMMENDED — awaiting sign-off] Model `Material` as belonging to a `Programme`.
**Rationale:** §12.1 says "each programme contains Materials". Associating materials directly with a programme is simpler and inherits the tier-gating from the programme's tier mapping.
**Changes required:**
- Add a `Material` entity to `schema.prisma` linked by `programmeId`.
**Blocker for:** Phase 9 (Materials).
**Entangled with:** None.

## D-7 — Voucher is ungoverned
**Class:** `DEFERRED`
**Decision:** Vouchers are out of scope for Phase 1.
**Rationale:** Vouchers lack a complete specification in the PRD and risk conflicting with BR-005. They will be addressed in Phase 2 when promotion mechanics are defined.
**Changes required:** None.
**Blocker for:** None.
**Entangled with:** None.

## D-8 — Payment state machine has no exit from Rejected
**Class:** `TECHNICAL`
**Decision:** Allow a `rejected` payment to transition back to `submitted` while retaining the rejection reason in the audit log and the row.
**Rationale:** §14.3 lacks a resubmit path, but FR-026 implies one. Following `architecture.md`, "one row per purchase intent" avoids polluting the payment history UI. 
**Changes required:**
- Implement `resubmitProof()` in `lib/payments/transitions.ts`.
- Update dashboard UI to show the rejection reason on `submitted` payments.
**Blocker for:** Phase 8 (Payments).
**Entangled with:** D-2.

## D-9 — Proof upload simultaneously required and optional
**Class:** `TECHNICAL`
**Decision:** Make `payment_reference` and `proof_url` nullable in the database.
**Rationale:** A payment begins in the `pending` state before the user uploads proof. Nullable fields allow the row to exist before the upload is completed.
**Changes required:** None (already modelled this way in `schema.prisma`).
**Blocker for:** None.
**Entangled with:** None.

## D-10 — Product type counts conflict
**Class:** `TECHNICAL`
**Decision:** Use a single enum in the database covering all distinct product types (e.g., `physical_book`, `podcast_cd`, `digital_resource`).
**Rationale:** §12.4 and the schema section list different counts. A unified enum satisfies both without structural conflicts.
**Changes required:**
- Update `ProductType` enum in `schema.prisma`.
**Blocker for:** Phase 12 (Orders).
**Entangled with:** None.

## D-11 — Events, Analytics, and Vouchers are billed but unscoped
**Class:** `DEFERRED`
**Decision:** Analytics and Vouchers are deferred to Phase 2; Events will only have a public listing page for Phase 1.
**Rationale:** §5.1 omits them, while other sections reference them. Treating Events as a read-only list for now satisfies the marketing need without building complex capacity-managed ticketing.
**Changes required:**
- Implement a static/read-only Events page.
**Blocker for:** None.
**Entangled with:** None.

## D-12 — RolePermission is missing from §16
**Class:** `TECHNICAL`
**Decision:** Defer the `RolePermission` table and hardcode permissions against the 5 RBAC roles.
**Rationale:** Since D-3 resolved the role set to the exact 5 roles listed in the §4.2 permission matrix, a dynamic `RolePermission` table is unnecessary complexity for Phase 1. `lib/permissions/` can evaluate rules directly against the user's role.
**Changes required:**
- Implement `lib/permissions/` using hardcoded checks based on §4.2.
- Remove `Permission` from Phase 2B schema plans.
**Blocker for:** Phase 6 (RBAC).
**Entangled with:** D-3.

## D-13 — Mentorship eligibility is unmeasurable
**Class:** `CLIENT`
**Decision:** [RECOMMENDED — awaiting sign-off] Require a mentee to hold at least one Completed programme enrolment with attendance >= 80% to be eligible for Mentor promotion.
**Rationale:** BR-015 requires qualification "through performance", but gives no threshold. Without a concrete metric, Super Admins have no systemic guardrail. This relies on D-4's resolution to track attendance accurately per programme.
**Changes required:**
- Add eligibility check in `lib/permissions/` for mentor promotion.
**Blocker for:** Mentor promotion workflow.
**Entangled with:** D-4.

## D-14 — NFRs are unmeasurable
**Class:** `CLIENT`
**Decision:** [RECOMMENDED — awaiting sign-off] Adopt a 30-minute idle timeout for admins, a 7-day timeout for members (with a 30-day absolute cap), and rate limits of 5 attempts/15min for login.
**Rationale:** Security controls require concrete numbers. The proposed defaults in `security.md` are standard industry practice and protect the platform while awaiting confirmation.
**Changes required:**
- Implement rate limits and session timeouts in `lib/auth/`.
**Blocker for:** None.
**Entangled with:** None.

## D-15 — Brand assets pending vs brand face decided
**Class:** `DEFERRED`
**Decision:** Continue using Montserrat and the provisional colour palette until the final brand pack is provided.
**Rationale:** The build system accommodates changes via `tokens.json`. Status colours will be mapped to the provisional palette for now.
**Changes required:** None.
**Blocker for:** None.
**Entangled with:** None.

## D-16 — Dark-theme error text contrast
**Class:** `TECHNICAL`
**Decision:** Use `--color-on-error-container` for text on raised error surfaces in dark mode.
**Rationale:** As documented in `design-system.md`, the base error colour fails contrast on raised surfaces. Using the container tokens guarantees WCAG AA compliance.
**Changes required:**
- Enforce usage in `components/ui/`.
**Blocker for:** None.
**Entangled with:** None.

## D-17 — Probation Room ordering
**Class:** `CLIENT`
**Decision:** [RECOMMENDED — awaiting sign-off] Place the WhatsApp Probation Room link on the post-signup dashboard rather than in the public funnel.
**Rationale:** Linking to a WhatsApp group before capturing registration loses the lead. Requiring signup first guarantees we capture the email and phone number for marketing, aligning with BO-001.
**Changes required:**
- Keep the `#join` anchor on the landing page.
- Add the Probation Room link to the free member dashboard.
**Blocker for:** Phase 3 (Landing page CTA).
**Entangled with:** None.

---

## Client questions

1. **(D-1) Should the "O'Free" tier activate automatically upon signup without requiring the user to submit a ₦0 payment?**
   - Option A: Yes. (Recommended: Cleaner user experience, prevents database pollution).
   - Option B: No, they must "checkout" for ₦0. (Creates unnecessary friction).
   *Recommendation: Option A*

2. **(D-2) Should we display the 50% discounted prices publicly on the marketing site, or only show them privately in the dashboard to eligible first-time buyers?**
   - Option A: Show only to eligible members privately. (Recommended: Prevents returning members from seeing a price they can't get).
   - Option B: Show publicly with an asterisk. (Risk of customer complaints).
   *Recommendation: Option A*

3. **(D-4) How should a member's progress be tracked when they have access to multiple programmes through their tier?**
   - Option A: Track attendance per programme. (Recommended: Allows members to progress at different speeds in different courses).
   - Option B: Track overall attendance tied strictly to the tier. (Less flexible for future additions).
   *Recommendation: Option A*

4. **(D-5) The PRD mentions "30+" certificates, but only 27 are actually listed in the catalogue. Can we correct the marketing copy to "27 certificates", and can you provide the exact mapping of which certificates belong to which tiers?**
   - Option A: Yes, correct to 27 and we will provide the mapping. (Recommended: Ensures we deliver exactly what is promised).
   - Option B: No, we will provide a full list of 30+ certificates before launch. (Risks delaying launch).
   *Recommendation: Option A*

5. **(D-6) Should downloadable learning materials (PDFs, videos) be attached to specific Programmes, or attached directly to Tiers?**
   - Option A: Attached to Programmes. (Recommended: Keeps content organized by subject matter).
   - Option B: Attached to Tiers. (Could make finding specific materials harder as the library grows).
   *Recommendation: Option A*

6. **(D-13) What is the exact performance threshold a mentee must meet to become eligible for promotion to a Mentor?**
   - Option A: Must hold at least one completed certificate with 80% attendance or higher. (Recommended: Provides a clear, measurable standard).
   - Option B: At the Super Admin's manual discretion only. (Harder to scale).
   *Recommendation: Option A*

7. **(D-14) Are you comfortable with a security policy that logs out Admin staff after 30 minutes of inactivity, and Members after 7 days?**
   - Option A: Yes, those defaults are fine. (Recommended).
   - Option B: No, we need different timeframes (please specify).
   *Recommendation: Option A*

8. **(D-17) Should the link to the WhatsApp "Probation Room" be given to visitors *before* they sign up, or *after* they create a free account?**
   - Option A: After they create an account. (Recommended: Ensures you capture their email address even if they don't join the group).
   - Option B: Before they sign up. (Risk of losing leads who join WhatsApp but never register).
   *Recommendation: Option A*

---

## Resolved technically

- D-3: Implemented 5 genuine RBAC roles (`visitor`, `member`, `mentor`, `admin`, `super_admin`).
- D-8: A `rejected` payment can transition back to `submitted` while retaining its rejection reason.
- D-9: `payment_reference` and `proof_url` are nullable in the database.
- D-10: Use a single `ProductType` enum covering all distinct product types.
- D-12: Deferred the `RolePermission` table; hardcoding permissions against the 5 RBAC roles.
- D-16: Enforcing `--color-on-error-container` for text on raised error surfaces in dark mode.
