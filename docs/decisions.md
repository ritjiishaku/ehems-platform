# EHEMS Decisions and Client Decision Register

This register records contradictions/gaps in `EHEMS PRD.md`, client decisions,
technical decisions, and implementation inputs that remain outstanding.
The PRD is preserved as source evidence; client-confirmed entries below resolve
the specified conflict for implementation without rewriting the PRD.

**Status key:** `BLOCKING` — do not build the affected feature until the
decision/input is available · `RESOLVED` — decision made; implementation may
remain · `NON-BLOCKING` — build around it or defer as recorded.

---

## D-1 — O'Free activation exception · RESOLVED; implementation pending

**The contradiction.** `EHEMS PRD.md:512` prices O'Free Levels at ₦0.
`:809` states an enrolment's status changes **only** when a linked payment
reaches `Verified`. `:965` (AC-001) requires that a visitor who signs up can
access the O'Free tier. A free tier generates no payment, so
`activateEnrolment()` never fires and AC-001 is unsatisfiable as modelled.

**Why it is not ours to fix.** BR-001 makes payments one-time and
tier-based; the activation path is built around them. Choosing a fix either
creates a ₦0 payment record or carves an exception out of the single
activation point — both touch entitlement, which is a client decision.

**Options.**

| # | Shape | Cost |
| - | ----- | ---- |
| A | `Enrolment.status` becomes `active` on creation when the tier is free; payments remain the trigger for every paid tier | Smallest change. One condition in `activateEnrolment`; the "payment ↔ enrolment" seam stays clean |
| B | Create a ₦0 `Payment` and auto-verify it at signup | Uniform state machine, but pollutes the payment table with non-payments and makes revenue queries wrong |
| C | Drop AC-001 and make O'Free a marketing tier with no enrolment at all | Cleanest model, contradicts the "lead with the free tier" strategy (`:112`) and BO-001 |

**Recommendation: A.** It preserves the §17.3 separation — payment and
enrolment stay separate entities — while acknowledging that a free tier needs
no money to move. Guard it so it can only ever apply to a zero-cost tier.

**Decision:** Option A confirmed by client on 2026-09-28.

---

## D-2 — Discount eligibility and public pricing · RESOLVED; implementation pending

**The contradiction.** §11.1 lists discounted prices (Advanced IV ₦375,000,
Advanced V ₦450,000, Higher Advanced VIII ₦625,000). BR-005 says the 50%
discount applies to a **first-time subscriber's first Advanced-tier purchase
only**, and BR-007 says it never repeats. But nothing in §16 models *who
qualifies*: there is no discount-eligibility field, and the pricing display
rule says the discounted price shows the list price struck through — with no
condition attached.

**The risk.** A public pricing page showing ₦375,000 to a returning member
who will be charged ₦750,000 on upgrade is a consumer-protection problem, not
just a display bug.

**What is already unambiguous** and needs no decision: the amounts
themselves, that upgrades are computed from **list price minus list price**
(BR-003), and that an incomplete prior tier forfeits the difference (BR-004).
`AGENTS.md` §3 pins all four discounted figures exactly.

**Options.** (A) Show list price only in public marketing; reveal a
discounted price on the member's own dashboard once eligibility is computed.
(B) Show "from ₦375,000" publicly with a first-purchase footnote.
(C) Show the discounted price to all, and rely on the difference being
explained at checkout.

**Recommendation: A**, with B acceptable if the client wants the acquisition
funnel benefit. What is needed either way: a `PricingMember` value object
carrying eligibility into `lib/pricing/` (already specified in
`.agents/rules/architecture.md`), and a decision on whether eligibility is
persisted or computed per request.

**Decision:** Option A confirmed by client on 2026-09-28. Show list price only in public marketing; reveal a discounted price on the member's dashboard.

---

## D-3 — Five assignable roles or eleven? · RESOLVED; implementation pending

**The original contradiction.** PRD §4.1:147-157 and the prior `AGENTS.md` §3
listed eleven roles: Visitor, Customer, Member (Mentee), Mentor,
Programme Participant,
Event Participant, Internship Applicant, Show Viewer, Admin, Super Admin,
Staff/Content Manager. §5.1:201 then says role-based access control covers
four: "Super Admin, Admin, Mentor, Member."

**Why it matters concretely.** Only five permission-matrix columns exist. Making
all eleven concepts assignable would require inventing permission grants for
six concepts; deriving them from account/domain state avoids unsupported role
grants while preserving the concepts required elsewhere in the PRD.

The PRD gives eleven role concepts but only five permission-matrix columns.
Treating every concept as an independently assignable role would require
inventing permission grants for six roles.

**Decision:** Five assignable RBAC roles (`visitor`, `member`, `mentor`,
`admin`, `super_admin`). Derive the remaining PRD role concepts from account,
programme, event, or other domain state rather than assigning them as roles.
Confirmed by the client on 2026-09-28. `ROLES` and the seed now contain only
these five assignable roles. Existing databases may retain legacy role rows;
authorization rejects keys outside this catalogue.

---

## D-4 — Enrolment-to-programme relationship · RESOLVED; implementation modeled

**The contradiction.** §16.2:696 gives `Enrolment` a **singular**
`programme_id`. §16.7:765 declares `Programme → ProgrammeTiers → Tier` as
many-to-many. §8.2 has one verified payment activate one enrolment. But a
member on Advanced Level V is mapped to several programmes, and
`.agents/workflows/new-programme.md:147` states a programme can serve multiple
 tiers and a tier can have multiple programmes. One enrolment cannot span N
 programmes under the original singular model.

**Downstream symptom, already hit.** The tier-removal guard in
`new-programme.md` counted `Enrolment` rows filtered by both `tierId` and
`programmeId` — a count that is structurally always `0`, so the guard never
fired. That workflow has been corrected to count by `tierId` only, which is
unambiguous. The confirmed join-table design is present in the current schema.

**Options.** (A) Keep `Enrolment` per tier, derive programme access from the
tier mapping, and drop `programme_id` entirely. (B) Make it
`EnrolmentProgramme` (join table) with per-programme attendance thresholds.
(C) One `Enrolment` per (payment × programme), which means a single payment
activates many rows and the §17.3 seam gets muddier.

**Recommendation: B** if per-programme attendance thresholds are wanted
(which §13.1's "configurable, per programme" implies), otherwise **A**. The
threshold question is entangled with this one, so answer them together.

**Decision:** Use a many-to-many `EnrolmentProgramme` join table with per-programme attendance thresholds (confirmed by client on 2026-09-28).

---

## D-5 — Certificate counts do not reconcile · BLOCKING for certificate catalogue

**The contradiction.** §5.1:195 promises "30+ certificates". The tier table
advertises 6 + 10 + 15 + 20 + 25 + slots. §11.3 enumerates **26** names, and
the current seed also contains 26. The client confirmed an approved total of
**27** on 2026-09-28, but the 27th name has not been supplied. Per-tier counts
therefore cannot be published as complete.

**Decision:** The approved catalogue total is 27 (confirmed by the client on
2026-09-28). The PRD and seed enumerate only 26 names. The client chose to keep
this unresolved pending delivery of the 27th name.

**Implementation gate:** Do not claim the complete 27-certificate catalogue,
seed certificate issuance, or finalize certificate-to-tier counts until the
client supplies the missing name and confirms its tier mapping. Preserve this
as a certificate-specific blocker; it does not block unrelated Phase 1 work.

---

## D-6 — Material access model · RESOLVED; implementation modeled

**The gap.** §12.1 says each programme contains "Materials: Tier-gated
resources (PDFs, videos, audio, links)". FR-032 requires members to download
tier-gated materials. §17.1 lists a Materials API group. The initial §16 schema
did not define a `Material` entity.

**Options.** (A) Materials belong to a programme, gated by the tier mapping
already in `ProgrammeTier`. (B) Materials belong to a tier directly, shared
across programmes. (C) A separate `Material` + `MaterialTier` join, so one
asset can be gated differently per programme.

**Initial recommendation:** C if the same PDF is likely to appear in several
programmes; A is simpler. The client confirmed A. The programme attachment
design is reflected in the current Prisma schema's `Material` relation.

**Decision:** Option A (attached to programmes) confirmed by client on 2026-09-28.

---

## D-7 — `Voucher` is ungoverned · NON-BLOCKING

**The gap.** §16.4:726 defines `Voucher` with `discount_type` and
`discount_value`, and §12 references discount mechanics — but no section
defines who creates vouchers, how they are validated, whether they stack with
the BR-005 discount, or whether they are Phase 1 at all. No rule ID covers
them. BR-005/BR-007 are the only pricing rules, and neither mentions a
voucher.

**Risk.** A voucher that stacks with the Advanced discount silently breaches
BR-005, which says the discount is "not combinable".

**Recommendation: defer vouchers out of Phase 1** unless the client confirms
they are needed, and when they are, state explicitly whether they combine
with BR-005. Do not build the table speculatively — `AGENTS.md` §9.

**Decision:** Deferred out of Phase 1.

---

## D-8 — Payment state machine resubmission · RESOLVED; payment implementation pending

**The gap.** §14.3:626 shows `Pending → Submitted → Under Review → Verified |
Rejected` with no arrow out of `Rejected`, yet the surrounding prose and FR-026
say a member may resubmit. §16.4 requires `payment_reference` and `proof_url`,
which a `Pending` row cannot have if it means "awaiting proof upload".

The client confirmed **transitioning the same row back to `submitted`**
(`resubmitProof()`), keeping the rejection reason and recording history in the
audit log. This defines one row per purchase intent rather than one row per
submission attempt.

**Decision:** Transition the same row back to submitted, preserving the
rejection reason/history in the audit log. Confirmed by the client on
2026-09-28.

---

## D-9 — Proof upload fields before submission · RESOLVED; payment implementation pending

**The contradiction.** Appendix G:1066-1069 marks `payment_reference` and
`proof_url` as required; §8.2 treats proof upload as the member's action. A
row that requires both cannot exist before the upload happens. The client
confirmed the fields may be nullable so a pending payment can exist before
proof submission.

**Decision:** `payment_reference` and `proof_url` may be null before submission.
Confirmed by the client on 2026-09-28.

---

## D-10 — Product types and community entitlement · RESOLVED; implementation pending

PRD §14.1 names physical, digital, and community-linked products, while §16.4
models physical/digital product types and a separate `ProductEntitlement`.

**Decision:** Product type represents fulfilment (`physical` or `digital`);
community access is represented as a separate entitlement. Confirmed by the
client on 2026-09-28. Implement the product type as one enum; preserve entitlement
as separate domain data.

---

## D-11 — Events, Analytics, and Vouchers scope · RESOLVED; implementation pending

The PRD scopes these inconsistently. Public event listings/admin event content
are distinct from event registration or capacity-managed ticketing.

**Decision:** Analytics and Vouchers deferred to Phase 2. Events are
admin-managed content with a public listing in Phase 1; ticketing and capacity
management remain out of scope. The event scope was confirmed by the client on
2026-09-28; the analytics/voucher deferral remains the recorded scope decision.

---

## D-12 — Role checks versus `RolePermission` · RESOLVED; implementation pending

The PRD schema lists `Permission`, and §17.2 requires permission checks per
endpoint. D-3 establishes five assignable roles that match the matrix columns.
D-12 records hardcoded permission checks for those roles as the Phase 1
technical choice; the permission-storage mechanism was not separately
client-confirmed.

**Recorded technical decision:** Use hardcoded checks for the five assignable
roles; no `RolePermission` table is required for Phase 1. The client confirmed
the five-role model in D-3 on 2026-09-28.

---

## D-13 — Mentorship eligibility is unmeasurable · NON-BLOCKING

BR-015 says mentors must first have been mentees and qualify "through
performance", with no threshold. `AGENTS.md` §3 adds that only a Super Admin
may promote. The promotion workflow needs a concrete bar — attendance
percentage? certificates held? an admin assessment? — or the rule is
unenforceable and Super Admins will improvise per member.

**Decision:** 80% attendance or higher on a completed certificate (confirmed by client on 2026-09-28).

---

## D-14 — NFR targets and session defaults · PARTIALLY RESOLVED

The PRD specifies a <3-second page-load target on 3G, 500+ concurrent users,
99% uptime, daily backups, and admin re-authentication for sensitive operations.
The client confirmed the proposed 30-minute admin / 7-day member session
lifetimes, 30-day absolute cap, 5 login attempts per 15 minutes, and 3 password
resets per hour on 2026-09-28. These defaults are now requirements for
implementation; no request-timeout value is specified in the PRD.

**Decision:** The documented session/rate-limit defaults (30-minute admin,
7-day member, 30-day absolute cap, 5 login attempts per 15 minutes, and 3 reset
attempts per hour) were confirmed by the client on 2026-09-28. Implement the
admin-specific lifetime; the current session implementation applies the member
lifetime to all users.

---

## D-15 — Brand assets and brand face · INPUT PENDING

ASM-001 and §22.1 list client-provided brand assets. The client chose to supply
final assets before launch. `tokens.json` nonetheless treats Montserrat as the brand face and
ships weights 300-800, while every colour is marked `Provisional`. When the
brand pack arrives, edit `tokens.json` and run `npm run build:tokens` — the
contrast audit runs as part of the build. **No hand-editing of
`styles/tokens.css`, and no hex codes in components**, or the audit is
bypassed.

One open question this does not settle: there is no `success`, `warning`, or
`info` colour role, yet the status chip needs five distinguishable states.
Today they map onto existing audited pairs. If the brand pack does not supply
state colours, say so and they will be added as audited roles.

**Decision:** Use final client-provided brand assets; delivery remains a launch
input. Update `tokens.json` and rebuild generated tokens when the pack arrives.

---

## D-16 — Dark-theme error text contrast · NON-BLOCKING (documented)

`--color-error` reaches AA for non-text UI in the dark theme but does **not**
reach 4.5:1 for body text on `--color-surface-container-high` or higher. The
token build's contrast audit does not cover that pair, so nothing fails. This
is documented in `.agents/rules/design-system.md` with the workaround (use
`--color-error-container` / `--color-on-error-container`). Extending the audit
to cover text-on-raised-container for every role is a good follow-up and
would be a build-script change, not a palette change.

**Decision:** Use container tokens for text on raised surfaces.

---

## D-17 — Probation Room ordering · NON-BLOCKING

PRD §8.1 places the Probation Room before signup, while the confirmed journey
places it after account creation.

**Decision:** The Probation Room link is offered after account creation,
followed by orientation and brochure/FAQ access (confirmed by the client on
2026-09-28). The link remains community-link data and must not be hardcoded.

---

## D-18 - Data subject request handling is authorised by a direct role check

PRD §4.2 defines thirteen permission rows and none of them covers data subject
requests, so there is no permission key to check.

**Decision (PROPOSED, not client-approved):** The admin data request queue is
gated by `requireRole('admin', 'super_admin')` in
`app/(admin)/admin/layout.tsx` and the handling action, rather than by a
fourteenth matrix row. Adding a row would have meant extending §4.2 — the one
document AGENTS.md §3 calls the permission source of truth — on the agent's
authority.

**Why it matters technically:** DSR handling is currently outside the
documented matrix, so a future reader of `lib/permissions/matrix.ts` will not
find it. If the client adds a §4.2 row, the swap is confined to
`app/(admin)/admin/layout.tsx` and `handleDataSubjectRequestAction`.

**Status:** Ask the client to confirm either that admin and Super Admin may
handle data subject requests, or that the action needs its own matrix row.

---

## D-19 - Terminal data request states are final, and closing one needs notes

**Decision (PROPOSED, not client-approved):**

1. `completed` and `rejected` have no outgoing transitions, so a recorded
   outcome cannot be silently reopened or overwritten. A member who wants
   something different submits a new request; both rows stay in the history.
2. A closing transition requires handling notes. The
   `.agents/skills/ndpa-compliance` skill requires a recorded reason for a
   rejection; this extends the same requirement to `completed`, since a request
   closed with no record of what was done is not a defensible answer to a
   statutory deadline.

**Why it matters technically:** it is one predicate in
`lib/ndpa/dsr-state.ts`, so relaxing requirement 2 for the client is a
one-line change with no migration.

**Status:** Confirm with the client. Requirement 1 in particular changes what an
admin can do to a historical record.

---

## D-20 - `AuditLog.actor` is RESTRICT, not SET NULL

SEC-015 makes the audit trail immutable, and the hand-written trigger blocks
every UPDATE. The schema nonetheless declared
`onDelete: SetNull` on the actor relation — a cascade the database can never
perform, because Postgres implements `SET NULL` as an UPDATE. The visible
symptom was a confusing trigger error (`audit_log is append-only: UPDATE is not
permitted`) when deleting a user who had audit history.

**Decision:** `onDelete: Restrict` (migration
`20260929115317_restrict_audit_log_actor`). A user with audit history is not
hard-deletable, and erasure runs through anonymisation instead. This matches
AGENTS.md §3 and the ndpa-compliance skill: audit entries are never deleted and
reference the user ID, which becomes a tombstone.

**Why it matters technically:** it closes a path where a future agent could
"fix" a failing erasure by dropping the constraint.

---

## D-21 - `Payment.orderId` is omitted until the Product/Order feature exists

**Status:** PROPOSED - confirm with the client before the first product sale.

The `Payment` model has no `orderId`, even though PRD §16.4 puts an order
reference on it. `Order`/`Product` is a separate in-scope Phase 1 feature
(physical and digital products) that has not been built yet, so there is nothing
for the column to point at.

**Decision:** omit the column rather than shipping a nullable field with no
referenced table. A nullable `orderId` with no `Order` model is a dangling
reference that reads as "sometimes order-backed" and is exactly the kind of
half-built seam AGENTS.md §9 warns against.

**Why it matters technically:** when products land, add `Order` and
`orderId` in one migration. Product payments are the reason `Payment.enrolmentId`
is nullable - a product payment has no enrolment - and `activateEnrolment`
already treats a missing enrolment as a successful non-error, so that case is
handled. Only the column is missing, and it is additive.

---

## D-22 - A payment is one-to-many on an enrolment, not one-to-one

**Status:** PROPOSED - low risk, but confirm before the first upgrade.

`Enrolment.payments` is a one-to-many relation. PRD §16.2 reads as one payment
per enrolment, which would be a unique `enrolmentId` on `Payment`.

**Decision:** not unique.

**Why:** D-8 requires a rejected payment to be resubmitted *on the same row*,
which is a deliberate rule and is tested. The one-to-one reading is still
satisfiable by that rule, so uniqueness is not currently violated. Making it a
hard constraint would foreclose a case that is genuinely likely: a member pays,
the transfer bounces, and the bank asks for a fresh reference. That is a second
`Payment` against the same `Enrolment`, and under a unique constraint it would
require either mutating a `verified` row or cancelling and recreating the
enrolment - which would break the `upgradeFromEnrolmentId` lineage and the
`MemberCertificate.enrolmentId` back-reference.

**What is enforced instead:** entitlement is computed from *a verified payment
linked to the enrolment*, never from the mere existence of a payment
(AGENTS.md §4). `activateEnrolment` uses `findFirst` on a verified payment, so
extra rejected or superseded rows are inert. The invariant that a `pending`
payment has no proof (D-9) and that a zero-amount payment cannot be verified are
enforced in `verifyPayment` and tested.

---

## D-23 - Payment proofs are served by a signed 60-second grant, not a session cookie alone

**Status:** PROPOSED - confirm the 60-second window with the client.

NFR-008 makes "viewing a member's payment proof file" a sensitive operation
needing re-authentication. `security.md` separately asks for proofs to be
"served via signed, expiring URLs". A plain `<a href>` satisfies neither: a GET
cannot prompt for a password, and a bare payment id in a URL is a replayable
bearer token in browser history and in any proxy log.

**Decision:** a server action verifies the admin's password with a real Argon2id
check, then mints an HMAC-signed grant bound to `(paymentId, actorId, expiry)`
with a 60-second TTL. The route handler
(`app/api/payment-proof/[paymentId]/route.ts`) requires all of: a session, the
§4.2 `payment.verify` grant, and a valid unexpired grant. Every successful open
writes a `PAYMENT_PROOF_VIEWED` audit row, because staff reading a member's
financial record is itself auditable (SEC-007).

Two details that are load-bearing:

- The route uses `getCurrentUser` and explicit status codes, not
  `requireRole`. The rbac guards redirect, which is right for a page and wrong
  for a route handler: a `fetch` follows the redirect to the HTML login page and
  gets `200 text/html` where it asked for JSON.
- The served `Content-Type` is derived from the *decrypted bytes*, not from a
  stored column. AES-GCM already guarantees the bytes are exactly what the member
  uploaded, so re-deriving is free and strictly safer than trusting a recorded
  type. Unclassifiable bytes are refused rather than served as octet-stream.

**Not done, and stated rather than ticked:** malware scanning (SEC-005) is not
implemented. Type, size, and magic bytes are enforced; there is no scanner in the
repo and shelling out to a binary that may not exist on the host is worse than
saying so. Production storage for the encrypted files is also unresolved -
`PAYMENT_PROOF_STORAGE_DIR` must point at a persistent volume outside the
project directory, because the container filesystem does not survive a redeploy.

---

## D-24 - A verified payment's amount is checked against the tier, not against the list price

**Status:** PROPOSED - the human half is a client process question.

`security.md` says to "confirm the amount matches the tier price before
verifying. An admin approving a mismatched amount is a revenue leak." Taken
literally as a system check, that instruction is wrong, and following it would
break two confirmed rules.

**Decision:** split the check in two.

- **The system enforces** the invariant `createPurchaseIntent` establishes: a
  `Payment` has an amount above zero, and a zero-cost tier never has a payment
  at all (D-1 creates none). `verifyPayment` refuses both and says so. A row
  that breaks this is a pricing or data-integrity bug, and verifying it would
  activate a paid enrolment for free.
- **The human verifies** the recorded amount against their banking record. The
  queue renders the tier's *list* price beside the recorded amount, but does
  **not** flag a difference as an error, because BR-003 (upgrade differences
  priced off list price) and BR-005 (first-purchase discount) both make a
  verified amount legitimately differ from the list price. A queue that
  highlighted those as mismatches would train verifiers to wave through real
  ones.

**Why this matters:** a naive "amount must equal list price" check would reject
every upgrade and every discounted first purchase - both of which the client
confirmed as business rules - and the staff workaround would be to stop reading
the queue.

---

| Class | Items |
| ----- | ----- |
| CONFIRMED — client decisions | D-1…D-6, D-8…D-11, D-13…D-15, D-17; Phase 1 stack; see individual entries for implementation follow-ups |
| RECORDED / TECHNICAL DECISIONS | D-7 voucher deferral; D-12 hardcoded permission checks; D-16 design-token handling; D-18 DSR authorised by a direct role check; D-19 terminal DSR states need notes; D-20 `AuditLog.actor` is RESTRICT |
| IMPLEMENTATION / INPUT BLOCKERS | D-5 missing 27th certificate name; provider/domain/region, final assets, and legal retention schedule are production gates |
| DEFERRED SCOPE | Email verification omitted from Phase 1 by client decision; SMS/WhatsApp/Telegram, analytics and vouchers remain deferred |
| STACK STATUS | Next.js + TypeScript, PostgreSQL + Prisma, Tailwind confirmed by client on 2026-09-28; hosting provider/domain/region remain pending |

---

## D-25 - System settings retain descriptions and update attribution

**Status:** PROPOSED - technical alignment with PRD §16.6.

The PRD defines `SystemSetting` with `key`, `value`, `description`,
`updated_by`, and `updated_at`. The original implementation only had the key,
value, and timestamp.

**Decision:** add nullable `description` and `updated_by` columns. `updated_by`
is intentionally a string rather than a User foreign key: the main seed,
test-payment seed, and migrations must be able to write settings before an
admin account exists. Admin UI writes will store the authenticated user id;
seed and migration writes use a stable source label.

Payment destinations are especially unsuitable for an undocumented key/value
row. The description marks test values as non-functional, and the attribution
answers who changed an account number without requiring a second audit-log join.

The payment mode defaults to `disabled` in the migration. Missing, malformed,
or production `test` mode also fails closed in `lib/payments/mode.ts`.

---

## D-26 - Payment proofs are stored in Vercel Blob, and `local` is refused in production

**Status:** PROPOSED - technical, no client input required. Hosting is settled
under CR-08; the proof *store* was previously recorded as blocked on it.

Phase 1 shipped payment proofs on the local filesystem, because hosting was
PENDING (CR-04) and a directory is the smallest thing that satisfies SEC-004.
Hosting is now Vercel, which invalidates that choice for production.

**The problem.** A Vercel function's filesystem does not survive a redeploy. The
failure is not a slow degradation — it is silent and permanent. The container is
discarded, `Payment.proofUrl` keeps pointing at bytes that no longer exist, and
the member's financial evidence is gone with no error in the system, the logs, or
the database. A payment in that state can never be verified or rejected, because
the artefact an admin is meant to look at is gone.

**Decision.** Storage is a driver behind `PAYMENT_PROOF_STORE` (`local` or
`blob`) in `lib/payments/proofs.ts`, and Vercel Blob is the production store.
`local` in production throws at the first operation rather than accumulating
unrecoverable evidence. The exported surface and the key format are unchanged, so
no caller and no existing row is affected by the switch.

Cloudflare R2 was considered and rejected for Phase 1: it needs a static
long-lived access key managed by hand, adds a large SDK dependency tree to a
deliberately lean 7-dependency runtime, and buys vendor neutrality that the
three-function seam already provides for close to free. The private store uses
Vercel's auto-rotating OIDC token, so there is no long-lived credential in the
environment at all.

**Three properties are deliberate and should not be undone:**

- Encryption happens *above* the driver. Every driver receives AES-256-GCM
  ciphertext, so bucket access control is defence in depth rather than the
  control that makes retaining receipts lawful, and no future driver can be
  swapped in that stores plaintext.
- Reads pass `useCache: false`. Vercel's private blobs can serve stale content for
  up to 60 seconds. An admin who opens a proof immediately after a member
  resubmits after a rejection (D-8) would otherwise be shown the *already
  rejected* receipt and could verify against evidence that is no longer the
  submission in question. This is a money-correctness property, not a
  performance one.
- `PAYMENT_PROOF_ALLOW_EPHEMERAL_STORE` exists solely because `next start` sets
  `NODE_ENV=production` and the Playwright suite must write a real proof through
  the UI. It is never set on a deployed host, so a production deploy that forgot
  `PAYMENT_PROOF_STORE=blob` still fails loudly.

**The proof size ceiling is set by the platform, not by taste.** Vercel caps a
server-side blob upload at 4.5 MB, and this is the only place a proof is ever
uploaded. The limit was originally 5 MB, chosen before a store existed, which
meant a member could pass validation and then be refused by the platform with a
message they could not act on. `MAX_PROOF_BYTES` is now 4 MB, leaving margin for
the ciphertext framing, and a test pins it below the platform cap so the two
cannot drift apart again. `next.config.ts`'s `bodySizeLimit` deliberately stays
above the validator ceiling so the member sees the validator's actionable
"photograph it again at a lower resolution" message rather than a generic
framework body-limit error.

**Not addressed here:** SEC-005 malware scanning of proofs remains an open gap,
and is recorded as such rather than silently ticked off.

---

## Client Decision Register - Production Roadmap

This register translates the production implementation roadmap into decision
items. It does not supersede the PRD or existing decision entries. Where a dated
entry below says the client confirmed a choice, treat it as decided unless that
record is inaccurate. “Technical recommendation” describes an implementation
preference; it is not a business decision.

The PRD remains unchanged as source evidence. This register records client
decisions and implementation blockers that resolve or narrow PRD ambiguities.

### CR-01 — Role model and permission assignment (D-3 / D-12)

1. **Decision ID:** CR-01 — D-3 / D-12.
2. **Decision:** Which identities are assignable RBAC roles, and how does the
   permission matrix apply to them?
3. **Current documented state:** PRD §4.1 lists eleven role concepts; §4.2
   defines permissions for five. The client confirmed five assignable roles in
   D-3 on 2026-09-28. D-12 records a technical hardcoded-check approach, not a
   separate client approval.
4. **Conflicting documentation/code:** Resolved in the current implementation:
   role constants and seed now define five; persisted `super_admin` is the
   canonical key used by the permission matrix. Existing database role rows
   from the previous eleven-role seed may remain, but are rejected by the code
   whitelist and are not newly seeded.
5. **Why it matters technically:** This determines the role table, seeds,
   session representation, authorization checks, and which staff actions can be
   granted.
6. **Options and consequences:**
   - **A. Five assignable roles; derive the other role concepts from account,
     enrolment, or event state.** Smaller permission surface; requires defining
     where those states live and replacing the six independently seeded roles.
   - **B. Eleven assignable roles with an explicit permission policy for all
     eleven.** Represents every PRD role directly; requires approval of six
     currently unspecified permission policies.
   - **C. Seed eleven, but only the five matrix roles grant permissions.**
     Closest to parts of the current implementation; leaves six assignable but
     functionally unprivileged roles.
 7. **Technical recommendation:** Use five assignable roles and derive the
    remaining PRD concepts from domain state. Normalize persisted and code-level
    role identifiers.
8. **Client confirmation required:** None; five roles were confirmed on
   2026-09-28. Review/cleanup of existing legacy role rows is a migration/data
   stewardship task, not a new role decision.
9. **Affected files/modules for implementation:** `lib/permissions/roles.ts`,
   `lib/permissions/matrix.ts`, `lib/permissions/index.ts`, `lib/auth/index.ts`,
   `prisma/schema.prisma`, `prisma/seed.ts`, role migrations, authorization
   tests, and admin role-management UI.
10. **Dependencies on previous phases:** Phase 0 decision alignment; existing
    identity/session foundation.
11. **Implementation phase dependent:** Phase 1 identity/authorization;
    remaining authorization tests and protected admin features depend on it.

### CR-02 — Certificate catalogue count and tier claims (D-5)

1. **Decision ID:** CR-02 — D-5.
2. **Decision:** Establish the authoritative catalogue and the certificate
   counts shown for each tier.
3. **Current documented state:** D-5 records an approved total of 27, but the
   client has chosen to keep the missing 27th name unresolved.
4. **Conflicting documentation/code:** PRD §1 and §11.2 describe “30+” and
   per-tier counts of 6/10/15/20/25+. PRD §11.3 enumerates 26 names, and the
   current seed also contains 26 names. `AGENTS.md` now suppresses per-tier
   counts pending the missing name and mapping.
5. **Why it matters technically:** The catalogue and tier mappings determine
   what members are promised, what can be issued, and what admins see.
6. **Options and consequences:** The client chose to keep 27 as the approved
   total and leave the missing name unresolved. A later catalogue change would
   require client direction; do not reduce the total or invent a name.
7. **Technical recommendation:** Keep certificate seed/UI claims gated until
   the approved name and tier mapping are supplied.
8. **Client confirmation required:** Supply the approved 27th certificate name
   and its tier mapping before certificate-catalogue completion.
9. **Affected files/modules after confirmation:** `prisma/seed.ts`,
   `lib/pricing/tiers.ts` or the eventual tier-catalogue source, certificate
   issuance logic, tier-comparison UI, `AGENTS.md`/PRD claims, and catalogue
   tests.
10. **Dependencies on previous phases:** Phase 2 tier catalogue/mapping and
    Phase 4 programme/enrolment foundations.
11. **Implementation phase dependent:** Phase 5 certificate catalogue,
     issuance, and member claims; unrelated Phase 1 work may proceed.

### CR-03 — Tier catalogue source of truth

1. **Decision ID:** CR-03 — tier catalogue authority.
2. **Decision:** Determine whether tier names, order, prices, and benefits are
   authoritative in code or in the database.
3. **Current documented state:** D-2 confirms that public marketing shows list
   prices only and eligible members may see their discount. It does not resolve
   catalogue persistence. The PRD gives Super Admin tier-configuration
   capability; the implementation plan describes a code catalogue.
4. **Conflicting documentation/code:** `lib/pricing/tiers.ts` and
   `prisma/seed.ts` duplicate the catalogue; the schema contains a Tier table.
   The implementation plan now records database authority as the technical
   direction required by Super Admin tier configuration in the PRD and
   `AGENTS.md`.
5. **Why it matters technically:** Multiple writable copies can drift on
   amounts, display order, retired tiers, discounts, and benefits.
6. **Options and consequences:**
   - **A. Database is authoritative; pure pricing functions consume a validated
     tier value object.** Supports Super Admin configuration; requires safeguards
     around price edits and existing enrolments.
   - **B. Code is authoritative; database is a read-only projection/seed.**
     Simple and testable, but conflicts with no-developer tier configuration
     unless that capability changes.
   - **C. Independently maintain a code and database copy.** Not recommended;
     synchronization becomes a recurring source of errors.
7. **Technical recommendation:** A, because the PRD’s Super Admin
   tier-configuration capability points to editable persistent data. Keep
   calculations pure by passing loaded catalogue data into pricing functions.
8. **Client confirmation required:** No new business choice if Super Admin tier
   configuration remains confirmed. Seek approval only if the client intends to
   remove that capability; otherwise this is a technical implementation choice.
9. **Affected files/modules after decision:** `lib/pricing/tiers.ts`, pricing
   types/functions, `prisma/schema.prisma`, `prisma/seed.ts`, admin tier UI,
   catalogue queries, and pricing/seed consistency tests.
10. **Dependencies on previous phases:** Phase 0 scope reconciliation and
    Phase 1 authorization for tier administration.
11. **Implementation phase dependent:** Phase 2 (catalogue/pricing/enrolment);
    affects Phases 3 and 6.

### CR-04 — Event scope (D-11)

1. **Decision ID:** CR-04 — D-11.
2. **Decision:** Confirm whether Phase 1 includes only a public event list or
   also admin event creation/management.
3. **Current documented state:** Client confirmed admin event CRUD, with no
   ticketing/capacity, on 2026-09-28. Analytics and vouchers remain deferred to
   Phase 2.
4. **Conflicting documentation/code:** PRD §5.1, FR-050, and §15.1 require
   event creation/management; the prior D-11 text said read-only.
   Capacity-managed ticketing is out of scope in `AGENTS.md` and the PRD.
5. **Why it matters technically:** Admin event management requires an Event
   model, CRUD permissions, and content workflows. A read-only list does not
   require ticketing.
6. **Options and consequences:**
   - **A. Public read-only event listing only.** Smaller scope; no registration,
     ticketing, or event admin workflow.
   - **B. Admin can create/edit event records; public page lists them.** Satisfies
     the PRD event-management language without adding capacity or ticketing.
   - **C. Add ticketing/capacity management.** Conflicts with the out-of-scope
     fence and requires a change request.
7. **Technical recommendation:** Implement admin-managed event content with a
   public listing; keep registration, ticketing, and capacity management out of
   scope.
8. **Client confirmation required:** None for CRUD/no-ticketing scope; confirmed
   on 2026-09-28.
9. **Affected files/modules after approval:** `prisma/schema.prisma` and
   migration, public event route, admin event routes/actions, authorization
   matrix, event validation, and event tests.
10. **Dependencies on previous phases:** Phase 0 scope confirmation and Phase 1
    authorization foundation.
11. **Implementation phase dependent:** Phase 6.

### CR-05 — Product types and product entitlements (D-10)

1. **Decision ID:** CR-05 — D-10.
2. **Decision:** Confirm the product-type vocabulary and whether
   “community-linked” is a product type or an entitlement.
3. **Current documented state:** Client confirmed physical/digital product
   types and community access as a separate entitlement on 2026-09-28.
4. **Conflicting documentation/code:** PRD §14.1 lists physical, digital, and
   community-linked products. PRD §16.4 models physical/digital and a separate
   `ProductEntitlement`. The current schema uses a string for `productType`.
5. **Why it matters technically:** Product type affects order fulfilment,
   delivery/download access, and whether an order grants another entitlement.
6. **Options and consequences:**
   - **A. Enum includes physical, digital, and community-linked.** Directly
     reflects §14.1; risks mixing fulfilment type with access behavior.
   - **B. Enum describes physical/digital fulfilment; community access is a
     separate entitlement.** Aligns with the separate `ProductEntitlement`
     entity; requires confirming the meaning of “community-linked.”
7. **Technical recommendation:** Use one enum for fulfilment types and model
   community access as a separate entitlement relation.
8. **Client confirmation required:** None; the distinction was confirmed on
   2026-09-28.
9. **Affected files/modules after approval:** `prisma/schema.prisma`,
   product/order migrations, product validation, `prisma/seed.ts`, order
   workflows, entitlement queries, and product/admin UI.
10. **Dependencies on previous phases:** Phase 0 product decision and Phase 1
    identity/authorization; Phase 3 payment workflow if product orders use the
    manual payment process.
11. **Implementation phase dependent:** Phase 6.

### CR-06 — Email verification (PRD FR-012)

1. **Decision ID:** CR-06 — PRD FR-012.
2. **Decision:** Include or omit email verification for registration.
3. **Current documented state:** PRD FR-012 is marked PROPOSED despite Must
   priority. Client chose to omit email verification from Phase 1 on
   2026-09-28; no verification workflow exists.
4. **Conflicting documentation/code:** The priority suggests it may be expected,
   but the classification says proposed. Current code has no verification token
   or verification route.
5. **Why it matters technically:** It affects registration state, session
   access, token storage/expiry, email templates, and account recovery.
6. **Options and consequences:**
   - **A. Implement verification before full account access.** Adds a token
     workflow and changes registration/login behavior.
   - **B. Omit verification in Phase 1.** Keeps current low-friction
     registration; treats FR-012 as unapproved scope.
7. **Technical recommendation:** Keep FR-012 out of Phase 1; do not implement a
   verification-token workflow.
8. **Client confirmation required:** None for Phase 1; omission confirmed on
   2026-09-28.
9. **Affected files/modules after approval:** Auth schema/migration,
   `lib/auth/`, registration/login actions and pages, notification templates and
   provider, and auth tests.
10. **Dependencies on previous phases:** Phase 0 approval and Phase 1 identity,
    session, and notification foundations.
11. **Implementation phase dependent:** Phase 1.

### CR-07 — In-app notifications (PRD §18.2; FR-055–060)

1. **Decision ID:** CR-07 — PRD §18.2 / FR-055–060.
2. **Decision:** Determine the Phase 1 notification channels and delivery
   requirements.
3. **Current documented state:** PRD §18.2 marks email and in-app as Phase 1.
   FR-055–059 confirm email notifications; FR-060 describes extensible channels
   as proposed. Current email delivery is console-only, and the service does not
   persist delivery results to the `Notification` model.
4. **Conflicting documentation/code:** The PRD requires in-app notifications,
   while the implementation plan emphasizes email abstraction and there is no
   in-app delivery UI/persistence flow. SMS/WhatsApp/Telegram are Phase 2 or
   proposed.
5. **Why it matters technically:** In-app notifications require persistent
   records and member/admin views; email requires a real provider and
   delivery/failure handling.
6. **Options and consequences:**
   - **A. Implement confirmed email and in-app channels for Phase 1.** Meets
     PRD §18.2; requires persistent notifications and UI.
   - **B. Email only.** Reduces scope but changes the PRD’s Phase 1 channel table.
   - SMS/WhatsApp/Telegram are not Phase 1 options unless scope changes.
7. **Technical recommendation:** A, following the existing PRD. Keep channel
   extensibility behind the abstraction; do not implement Phase 2 channels now.
8. **Client confirmation required:** No new decision to implement email and
   in-app if the PRD remains authoritative. Approval is required only to change
   scope or add proposed channels early.
9. **Affected files/modules after approval:** `lib/notifications/`, notification
   provider/templates, `Notification` model, notification queries/UI,
   configuration, and notification tests.
10. **Dependencies on previous phases:** Phase 1 identity/authorization and the
    approved notification provider/configuration; payment events depend on
    Phase 3.
11. **Implementation phase dependent:** Email begins in Phase 3; in-app
    surfaces arrive with the member/admin dashboard in Phases 4–6.

### CR-08 — Hosting, domain, and production environments (PRD Appendix C)

1. **Decision ID:** CR-08 — PRD Appendix C.
2. **Decision:** Select production hosting and domain.
3. **Current documented state:** Client selected the managed-hosting direction
   on 2026-09-28.
   Provider, domain, and region are deferred as deployment blockers. SSL,
   staging/production, daily backups, uptime monitoring, and error tracking are
   PRD requirements.
4. **Conflicting documentation/code:** The repository has CI but no production
   deployment configuration or named hosting target.
5. **Why it matters technically:** Hosting determines runtime, database
   connectivity, environment configuration, scaling, logs, backups, and
   operational ownership.
6. **Options and consequences:**
   - **A. Managed application hosting with managed PostgreSQL.** Reduces
     operational burden; provider limits and database region must be checked.
   - **B. Client-controlled cloud/server infrastructure.** Offers more control;
     requires operational ownership of deployment, scaling, security, and
     backups.
   - **C. Other client-selected hosting.** Requires compatibility review against
     Next.js, PostgreSQL, private file storage, and stated targets.
7. **Technical recommendation:** Use managed application hosting and managed
   PostgreSQL; validate provider constraints and region before deployment.
8. **Client confirmation required:** Provider, domain, DNS owner, and region
   remain pending. These do not block non-production work.
9. **Affected files/modules after approval:** Deployment workflows/configuration,
   environment templates, database configuration, URL settings, security
   headers, monitoring, and operational runbooks.
10. **Dependencies on previous phases:** Hosting constraints must be known
    before selecting payment-proof storage in Phase 3; production rollout follows
    Phases 1–6.
11. **Implementation phase dependent:** Phase 7; hosting constraints should be
    known earlier for storage and integration design.

### CR-09 — Brand and content assets (PRD §22.1; D-15)

1. **Decision ID:** CR-09 — PRD §22.1 / D-15.
2. **Decision:** Provide final brand/content assets or explicitly approve use of
   provisional assets through launch.
3. **Current documented state:** Client chose to supply final assets/content on
   2026-09-28. PRD §22.1 lists the logo, brand colors/fonts, brochure, FAQ,
   programme descriptions, certificate templates,
   product details, media, testimonials, and community URLs. D-15 records brand
   assets as deferred until the final pack.
4. **Conflicting documentation/code:** The app ships provisional tokens and
   Montserrat; some content and links are not supplied. D-17 confirms the
   Probation Room step occurs after account creation.
5. **Why it matters technically:** Final branding affects tokens and contrast;
   missing documents, programme data, templates, and community URLs prevent
   complete customer-facing workflows.
6. **Options and consequences:**
   - **A. Supply approved assets/content before launch.** Enables faithful
     branding and complete content.
   - **B. Explicitly approve provisional branding/content for launch.** Allows
     launch with recorded limitations and planned follow-up updates.
   Missing operational URLs/content must not be invented.
7. **Technical recommendation:** Use final client-approved brand assets and
   content before launch; retain provisional tokens only during development.
8. **Client confirmation required:** No new choice; delivery/approval of
   community URLs, programme descriptions, certificate templates, brochure,
   FAQ, and product data remains a launch input.
9. **Affected files/modules after approval:** `tokens.json` and generated token
   stylesheet, page content/data, public routes, product/programme seed or
   configuration, certificate assets, and community-link records.
10. **Dependencies on previous phases:** Phase 0 content/brand inputs; catalogue
    and content entry in Phases 2 and 6.
11. **Implementation phase dependent:** Public/catalogue readiness in Phases 2
    and 6; final sign-off in Phase 7.

### CR-10 — Retention periods and NDPA/legal obligations

1. **Decision ID:** CR-10 — PRD SEC-013–018 / D-14.
2. **Decision:** Approve data-category retention periods and determine
   applicable NDPA/NDPC obligations.
3. **Current documented state:** Client selected a legal-approved retention
   schedule before production personal-data processing on 2026-09-28. PRD
   confirms DSR, breach tracking, retention, sensitive-data handling, and
   cross-border safeguards. D-14 confirms
   session/rate-limit defaults; it does not confirm retention periods. The seed
   says to confirm retention days with the client.
4. **Conflicting documentation/code:** `RetentionPolicy` rows have seeded day
   counts described as conservative defaults. The PRD specifies retention by
   category, not those exact durations. Hosting region is also pending.
5. **Why it matters technically:** Retention jobs, deletion/anonymization,
   audit longevity, backups, and breach workflows depend on an approved
   schedule and legal interpretation.
6. **Options and consequences:**
   - **A. Client/legal counsel supplies category-specific periods and actions.**
     Enables implementation against an approved policy.
   - **B. Use current seed values as provisional defaults pending review.**
     Technically possible, but they must not be represented as legally approved.
   - **C. Defer production processing of affected data until the schedule is
     approved.** Reduces uncertainty but may delay launch.
7. **Technical recommendation:** A; obtain legal advice where needed. Do not
   infer legally approved periods from current seed values.
8. **Client confirmation required:** Exact periods/actions per category, legal
   review ownership, DPO/DCPMI determination, and cross-border safeguards remain
   pending. Production personal-data processing is gated on resolution.
9. **Affected files/modules after approval:** `prisma/seed.ts`,
   `RetentionPolicy` schema/data, NDPA services/jobs/UI, hosting-region
   configuration, audit/backup procedures, and compliance tests.
10. **Dependencies on previous phases:** Phase 0 legal/retention decisions and
    hosting-region selection; retention constraints apply throughout Phases 1–6.
11. **Implementation phase dependent:** Compliance operations in Phase 7;
    policy must be approved before production data is processed.

## Register Summary

### A. Decisions requiring client approval

- No remaining business-choice approval is required for CR-01, CR-04, CR-05,
  or CR-06; see the recorded client decisions below.
- **CR-02 / D-5:** Client chose to keep the 27th certificate name unresolved.
  This blocks completion of the certificate catalogue, not unrelated work.
- **CR-08:** Managed hosting is selected; provider, domain, DNS owner, and
  region remain deployment inputs.
- **CR-09:** Final assets/content are required; delivery remains a launch input.
- **CR-10:** Legal-approved retention schedule is required before production
  processing; exact periods and review ownership remain outstanding.

### B. Decisions already confirmed

Do not reopen these as new decisions if their recorded client confirmations are
valid:

- **Stack:** Next.js App Router + TypeScript, PostgreSQL + Prisma, and Tailwind
  confirmed on 2026-09-28.
- **D-1:** O'Free enrolment activates for a zero-cost tier without a payment.
- **D-2:** Public marketing shows list price; eligible members may see their
  discounted price.
- **D-3:** Five assignable RBAC roles; derive other PRD role concepts from
  domain state.
- **D-4:** Enrolment-to-programme relationship is many-to-many with
  per-programme attendance thresholds.
- **D-5:** Approved catalogue total is 27; the name of the 27th certificate is
  still outstanding.
- **D-6:** Materials attach to programmes.
- **D-8:** Rejected payment resubmits on the same row; preserve rejection
  history.
- **D-9:** Payment reference and proof URL may be null before proof submission.
- **D-10:** Physical/digital are product types; community access is a separate
  entitlement.
- **D-11:** Admin-managed event content and public listing; no event ticketing or
  capacity. Analytics and vouchers remain deferred.
- **D-13:** Mentor criterion is 80% attendance or higher on a completed
  certificate.
- **D-14:** Session/rate-limit defaults are recorded as client-confirmed. Code
  must still implement the admin-specific session lifetime.
- **D-17:** Probation Room follows account creation.
- **CR-06:** Email verification is omitted from Phase 1.
- **CR-08:** Managed hosting is selected; provider/domain/region are deferred to
  deployment planning.
- **CR-09:** Final client assets/content are to be supplied before launch.
- **CR-10:** Obtain a legal-approved retention schedule before processing
  production personal data.
- **PRD §18.2:** Email and in-app notifications are Phase 1 requirements, not
  new decisions.

**Recorded technical choices, not separately client-confirmed:** D-7 voucher
deferral, D-12 hardcoded permission checks, and D-16 token handling. D-12 is the
technical implementation default for Phase 1 unless the client requests a
different permission-storage model.

**Remaining inputs:** the 27th certificate name and tier mapping; managed host,
domain, DNS owner, and region; final assets/content; exact legal retention
periods and legal-review ownership. D-7 vouchers remain deferred from Phase 1;
D-16 is a technical design decision.

### C. Decisions resolvable technically without new client input

- Normalize role identifiers to a canonical representation as Phase 1 work.
- Use hardcoded permission checks for the five assignable roles per D-12 unless
  the client requests a different permission-storage model.
- Use one tier source of truth. The PRD's confirmed Super Admin tier
  configuration supports database authority; pure pricing functions can consume
  validated data.
- Implement the PRD-confirmed in-app notification channel alongside email;
  keep SMS/WhatsApp/Telegram deferred.
- Choose server actions versus route handlers per operation; business
  requirements do not mandate REST.
- Add relational constraints for already-confirmed relationships without
  changing business behavior.
- Keep the O'Free zero-price activation as the narrowly guarded D-1 exception.
- Store payment proofs in Vercel Blob behind a `PAYMENT_PROOF_STORE` driver seam,
  with `local` refused in production (D-26).

### D. Decisions that block implementation

- **Phase 1:** No Phase 0 client decision blocks implementation. Role code and
  seed must be aligned to D-3/D-12 before admin authorization is relied on.
- **Phase 2:** Database-authoritative tier configuration follows the existing
  PRD requirement; public discounts follow D-2.
- **Phase 5 certificates:** D-5's missing 27th name and tier mapping block
  final catalogue seeding, issuance, and complete count claims.
- **Phase 6:** Event CRUD/no-ticketing and separate community entitlements are
  decided; implementation can proceed after prior authorization/payment work.
- **Production launch:** Provider/domain/region, final assets/content, and the
  legal-approved retention schedule remain gates.

### E. Phase 0 closeout checklist — 2026-09-28

- [x] Confirm the dated client-decision records D-1, D-2, D-4, D-5, D-6, D-13,
      D-14, and D-17 are accurate.
- [x] Confirm the stack and five-role authorization model.
- [x] Confirm same-row payment resubmission and nullable pre-submission proof
      fields (D-8/D-9).
- [x] Confirm product entitlement, event CRUD/no-ticketing scope, and omission of
      email verification from Phase 1.
- [x] Select managed hosting direction, final client assets, and legal-approved
      retention schedule as launch requirements.
- [ ] Obtain the approved 27th certificate name and tier mapping; certificate
      catalogue completion remains blocked.
- [ ] Select managed hosting provider/domain/region before deployment.
- [ ] Receive final assets/content and legal-approved retention schedule before
      production launch/data processing.
- [x] Reconcile `AGENTS.md`, `.agents/rules/`, implementation-plan status, and
      schema/seed comments with the approved decisions.
- [x] Align role constants and seed output to five assignable roles. Existing
      database rows for legacy concepts are not newly seeded and are denied by
      authorization unless an explicitly approved migration handles them.
