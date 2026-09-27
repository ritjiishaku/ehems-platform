# Open decisions — EHEMS Phase 1

Every item here is a contradiction **inside** `EHEMS PRD.md`, or a gap in it.
They are recorded rather than fixed because `AGENTS.md` §5 says the PRD wins,
§6 says to flag conflicts rather than silently resolve them, and §12 makes
CONFIRMED rules immutable without client sign-off. Picking an answer to any
of these changes what the client sells, who can access what, or how money is
calculated.

**Status key:** `BLOCKING` — do not build the affected feature until answered ·
`NON-BLOCKING` — build around it, revise later.

---

## D-1 — O'Free can never activate · BLOCKING

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

---

## D-2 — Discounted prices are unmodelled and shown unconditionally · BLOCKING

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

---

## D-3 — Four roles or eleven? · BLOCKING

**The contradiction.** §4.1:147-157 and `AGENTS.md` §3 both list **eleven**
roles: Visitor, Customer, Member (Mentee), Mentor, Programme Participant,
Event Participant, Internship Applicant, Show Viewer, Admin, Super Admin,
Staff/Content Manager. §5.1:201 then says role-based access control covers
four: "Super Admin, Admin, Mentor, Member."

**Why it matters concretely.** Seeding four roles makes Staff/Content Manager,
Show Viewer, Programme Participant, and Event Participant unrepresentable —
and §22.2 requires content managers to publish programmes without a developer.
Every `requireRole` check would then be evaluated against an incomplete role
table. `Internship Applicant` is Phase 2, so it may legitimately be deferred,
but that is a separate decision from the seed.

**Recommendation: eleven**, matching §4.1 and the role list in `AGENTS.md` §3,
with `Internship Applicant` seeded but unused. §4.1 is the more specific and
more recently structured section, and `AGENTS.md` already commits to eleven.
**This needs confirmation**, because it changes what staff can be granted.

---

## D-4 — `Enrolment` cannot model programme access · BLOCKING

**The contradiction.** §16.2:696 gives `Enrolment` a **singular**
`programme_id`. §16.7:765 declares `Programme → ProgrammeTiers → Tier` as
many-to-many. §8.2 has one verified payment activate one enrolment. But a
member on Advanced Level V is mapped to several programmes, and
`.agents/workflows/new-programme.md:147` states a programme can serve multiple
tiers and a tier can have multiple programmes. One enrolment cannot span N
programmes, and one payment cannot activate N enrolments.

**Downstream symptom, already hit.** The tier-removal guard in
`new-programme.md` counted `Enrolment` rows filtered by both `tierId` and
`programmeId` — a count that is structurally always `0`, so the guard never
fired. That workflow has been corrected to count by `tierId` only, which is
unambiguous, but the modelling gap remains.

**Options.** (A) Keep `Enrolment` per tier, derive programme access from the
tier mapping, and drop `programme_id` entirely. (B) Make it
`EnrolmentProgramme` (join table) with per-programme attendance thresholds.
(C) One `Enrolment` per (payment × programme), which means a single payment
activates many rows and the §17.3 seam gets muddier.

**Recommendation: B** if per-programme attendance thresholds are wanted
(which §13.1's "configurable, per programme" implies), otherwise **A**. The
threshold question is entangled with this one, so answer them together.

---

## D-5 — Certificate counts do not reconcile · BLOCKING

**The contradiction.** §5.1:195 promises "30+ certificates". The tier table
advertises 6 + 10 + 15 + 20 + 25 + slots — well over 76. §11.3, the catalogue
marked "(Summary)", lists **27** names. The seed contract in `AGENTS.md` §11
says the certificate seed must match §11 exactly, and the client sees it on
first login.

**Options.** (A) §11.3 is the truth; correct the "30+" claim and the tier
advertisements down. (B) A fuller catalogue exists outside the PRD; supply
it. (C) The per-tier counts are cumulative targets, not distinct
certificates.

**Recommendation: A** unless the client has a fuller list — the summary is the
only actual enumeration in the document. The test in
`.agents/rules/testing.md` pins §11.3, so it currently asserts 27. **The
per-tier numbers are member-facing marketing copy; shipping them beside a
27-item catalogue invites a complaint.**

---

## D-6 — No `Material` entity · BLOCKING for materials only

**The gap.** §12.1 says each programme contains "Materials: Tier-gated
resources (PDFs, videos, audio, links)". FR-032 requires members to download
tier-gated materials. §17.1 lists a Materials API group. **§16 defines no
`Material` entity**, so there is nowhere to store them.

**Options.** (A) Materials belong to a programme, gated by the tier mapping
already in `ProgrammeTier`. (B) Materials belong to a tier directly, shared
across programmes. (C) A separate `Material` + `MaterialTier` join, so one
asset can be gated differently per programme.

**Recommendation: C** if the same PDF is likely to appear in several
programmes; **A** is simpler and probably sufficient. Flagged in
`new-programme.md`; the materials feature should not be built until this is
answered.

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

---

## D-8 — Payment state machine has no exit from `Rejected` · BLOCKING

**The gap.** §14.3:626 shows `Pending → Submitted → Under Review → Verified |
Rejected` with no arrow out of `Rejected`, yet the surrounding prose and FR-026
say a member may resubmit. §16.4 requires `payment_reference` and `proof_url`,
which a `Pending` row cannot have if it means "awaiting proof upload".

The rules set has been aligned on **transitioning the same row back to
`submitted`** (`resubmitProof()`), keeping the rejection reason and recording
history in the audit log. That is a technical reconciliation, not a client
decision — but confirm it, because "one row per purchase intent" versus "one
row per submission attempt" changes the member's payment history UI.

---

## D-9 — Proof upload simultaneously required and optional · NON-BLOCKING

**The contradiction.** Appendix G:1066-1069 marks `payment_reference` and
`proof_url` as required; §8.2 treats proof upload as the member's action. A
row that requires both cannot exist before the upload happens. `Payment` has
been modelled with those fields nullable to make `pending` constructable. Fine
to proceed; worth a line of confirmation.

---

## D-10 — Product type counts conflict · NON-BLOCKING

§12.4 describes three product types; the schema section supports two. Small,
but it decides whether a product table or a variant table gets built.

---

## D-11 — Events, Analytics, and Vouchers are billed but unscoped · NON-BLOCKING

§5.1's in-scope feature list omits Events, Analytics, and Vouchers, while
other sections reference all three and the phase plan bills them. Either they
are Phase 1 and §5.1 is incomplete, or they are Phase 2 and the references
are stale. **Events in particular** appears in `AGENTS.md` §9's in-scope list
as a public page and in the out-of-scope fence as "event ticketing with
capacity management" — those are different things and both can be true, but it
should be said plainly.

---

## D-12 — `RolePermission` is missing from §16 · BLOCKING for RBAC

§16.1:676 defines a `Permission` entity, and §17.2 requires "permission checks
per endpoint", but there is no join between roles and permissions. Role checks
alone cannot express the §4.2 matrix, which is finer-grained than roles in
places. `AGENTS.md` §3 requires least privilege. Needs either a
`RolePermission` table or an explicit decision that role checks are
sufficient for Phase 1.

---

## D-13 — Mentorship eligibility is unmeasurable · NON-BLOCKING

BR-015 says mentors must first have been mentees and qualify "through
performance", with no threshold. `AGENTS.md` §3 adds that only a Super Admin
may promote. The promotion workflow needs a concrete bar — attendance
percentage? certificates held? an admin assessment? — or the rule is
unenforceable and Super Admins will improvise per member.

---

## D-14 — NFRs are unmeasurable · NON-BLOCKING

NFR-001 (page load < 3s on 3G) has no named network profile or page weight.
NFR-002 (concurrent users) has no number. There is no uptime target, no
session-timeout value, no request timeout, and no re-authentication window
beyond NFR-008's existence. `.agents/rules/security.md` now carries proposed
defaults (30 min admin / 7 day member session lifetime, 30-day absolute cap,
5 attempts per 15 min, 3 password resets per hour) explicitly marked as
needing client confirmation. They are safe to build against; they are not
contractual until confirmed.

---

## D-15 — Brand assets pending vs brand face decided · NON-BLOCKING

ASM-001 and §22.1 both say the client provides all brand assets before
development. `tokens.json` nonetheless treats Montserrat as the brand face and
ships weights 300-800, while every colour is marked `Provisional`. When the
brand pack arrives, edit `tokens.json` and run `npm run build:tokens` — the
contrast audit runs as part of the build. **No hand-editing of
`styles/tokens.css`, and no hex codes in components**, or the audit is
bypassed.

One open question this does not settle: there is no `success`, `warning`, or
`info` colour role, yet the status chip needs five distinguishable states.
Today they map onto existing audited pairs. If the brand pack does not supply
state colours, say so and they will be added as audited roles.

---

## D-16 — Dark-theme error text contrast · NON-BLOCKING (documented)

`--color-error` reaches AA for non-text UI in the dark theme but does **not**
reach 4.5:1 for body text on `--color-surface-container-high` or higher. The
token build's contrast audit does not cover that pair, so nothing fails. This
is documented in `.agents/rules/design-system.md` with the workaround (use
`--color-error-container` / `--color-on-error-container`). Extending the audit
to cover text-on-raised-container for every role is a good follow-up and
would be a build-script change, not a palette change.

---

## D-17 — Probation Room ordering · NON-BLOCKING

§8.1:323-327 orders the journey *Visitor → WhatsApp Probation Room → sign up
→ downloads brochure + FAQ*. `AGENTS.md` §9 and the email skill treat the
Probation Room link as a **post**-signup step. Someone reading only the PRD
will build the funnel in the wrong order. One line of confirmation needed.

**Interim position taken on the landing page (PROPOSED — a deliberate deviation
from the approved plan, flagged for the client).** The approved plan named
`/register` as the interim Get started target. That was changed during the build
to an **in-page anchor to `#join`**, a section on `/` that states the signup →
brochure/FAQ sequence, and it does **not** link to a WhatsApp URL.

Two reasons, both load-bearing:

1. The approved plan specified `/register` as the interim target, but Phase 5
   (auth) has not been built. A link to a route that does not exist is a 404 on
   the primary call to action, and building a placeholder `/register` would be
   exactly the "forward-compatible stub" that `AGENTS.md` §9 forbids. The anchor
   has a real target, so the page ships working.
2. A WhatsApp link is **data**, not code — a `CommunityLink` row keyed by tier
   (`.agents/rules/architecture.md`). Hardcoding one to settle a funnel-ordering
   question would bake in the answer to D-17 before the client has given it.

`test/e2e/landing-page.spec.ts` asserts the CTA resolves to a visible target, so
a dangling `#anchor` fails the suite rather than shipping. The Probation Room
step is deliberately absent from `#join`'s copy for the same reason.

**This needs a yes or no.** If the client would rather have `/register` on day
one, the alternative is to build a minimal registration page in Phase 5 before
the landing page ships, which is a scope change rather than a copy change. Once
D-17 is answered, this is a one-line change plus, if Probation Room comes first,
a `CommunityLink` seed row.

---

## Classification summary

| Class | Items |
| ----- | ----- |
| CONFIRMED — do not touch without sign-off | BR-001…BR-017, SEC-001…SEC-020, all prices in §11.1, all six tier names |
| PROPOSED — safe to build, flag for review | D-8, D-9, D-14, D-16 |
| PENDING — awaiting client | D-1, D-2, D-3, D-5, D-6, D-7, D-10, D-11, D-13, D-15, D-17 |
| ASSUMPTION — this repo's choice, recorded in `AGENTS.md` §2 | Next.js + Prisma + Tailwind, argon2id, Postgres, npm, WAT rendering |
