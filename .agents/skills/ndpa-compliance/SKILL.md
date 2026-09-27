---
name: ndpa-compliance
description: Build or modify anything that touches personal data on EHEMS, in line with the Nigeria Data Protection Act. Use when adding a form that collects user data, a new entity holding personal data, an upload, a deletion or export feature, or anything involving member records. Also use when reviewing an existing feature for compliance gaps.
---

# NDPA Compliance

EHEMS processes personal data of Nigerian healthcare professionals — names,
emails, phone numbers, professions, payment details, and potentially health
data. The Nigeria Data Protection Act (NDPA) applies. Compliance is not a
Phase 2 concern; the schema and the flows must carry it from day one.

**The failure mode this skill prevents:** shipping a feature that collects
personal data with no consent record, no retention rule, and no audit
trail — then trying to retrofit those across a live production dataset
with real members already registered. That retrofit is expensive and
risky. Build it in.

## When this skill applies

Load it whenever you:

- Add or change a form that collects personal data
- Add or change an entity that stores personal data
- Add a file upload (proof of payment is personal data)
- Build account deletion, data export, or profile editing
- Touch `ConsentRecord`, `DataSubjectRequest`, `BreachIncident`,
  `AuditLog`, or `RetentionPolicy`
- Handle payment details or anything health-related
- Add a third-party integration that receives personal data

## The five obligations, mapped to entities

| Obligation                    | Entity               | PRD ref          |
| ----------------------------- | -------------------- | ---------------- |
| Capture consent               | `ConsentRecord`      | SEC-011, SEC-012 |
| Honour data subject rights    | `DataSubjectRequest` | SEC-013          |
| Record and report breaches    | `BreachIncident`     | SEC-014          |
| Retain and delete on schedule | `RetentionPolicy`    | SEC-016          |
| Keep an immutable trail       | `AuditLog`           | SEC-015          |

Plus two flags that apply across every entity: sensitive data (SEC-017)
and cross-border transfer (SEC-018).

## 1. Consent

### Capture at registration

Every user consents at signup. The record captures:

```prisma
model ConsentRecord {
  id              String        @id @default(cuid())
  userId          String
  consentType     ConsentType
  consentVersion  String        // e.g. "1.0", "2026-01"
  consentText     String        // the exact wording shown
  givenAt         DateTime      @default(now())
  withdrawnAt     DateTime?
  ipAddress       String
  userAgent       String

  user            User          @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([consentType])
}

enum ConsentType {
  data_processing
  marketing
  sensitive_data
  cross_border_transfer
}
```

The matching back-reference is required on `User` for `prisma generate` to
succeed:

```prisma
// on User
consentRecords        ConsentRecord[]
dataSubjectRequests   DataSubjectRequest[]
notifications         Notification[]
```

### The consent text

**Store the exact text shown, not a reference to it.** Policy wording
changes. Six months later you must be able to prove what this specific
member agreed to, verbatim. A version number alone is not enough.

**Consent types are separate.** A member may consent to data processing
(required to use the platform) while declining marketing (optional).
Never bundle optional consent into the required one. Never make marketing
consent a condition of registration.

### Withdrawal

Withdrawal is a first-class action, available from profile settings.

- **Never delete the consent row.** Set `withdrawn_at`.
- A new consent of the same type creates a **new row**, not an update.
- The full history — granted, withdrawn, re-granted — is preserved.
- **Every consent type is withdrawable from the UI, including
  `data_processing`** (SEC-012: withdrawal must be possible without deleting
  the account). If withdrawing `data_processing` would leave the account
  unusable, that is a product decision to raise as a change request — it is
  not a licence to remove the control. Offer the withdrawal, show plainly
  what will stop working, and let the member choose erasure instead if they
  prefer.

### The consent text

Admin-editable via `SystemSetting`, but the version is bumped manually
when the wording changes. Never auto-bump. If the wording changes
materially, existing members may need to re-consent — a deliberate,
reviewed decision, not a side effect of an edit.

## 2. Data subject requests

Members have rights. Each must be honoured within a defined window
(the NDPA allows one month; treat it as 30 days).

```prisma
model DataSubjectRequest {
  id             String        @id @default(cuid())
  userId         String
  requestType    DSRType
  status         DSRStatus     @default(pending)
  requestedAt    DateTime      @default(now())
  completedAt    DateTime?
  handledBy      String?
  responseNotes  String?

  user           User          @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([status])
}

enum DSRType {
  access          // "what data do you hold on me?"
  rectification   // "correct my record"
  erasure         // "delete my account and data"
  restriction     // "stop processing for X purpose"
  portability     // "give me my data in a portable format"
  objection       // "I object to this processing"
}

enum DSRStatus {
  pending
  in_progress
  completed
  rejected
}
```

**Build the intake path in Phase 1.** It can be as simple as a form in
profile settings plus an admin view. The hard part is not the UI — it's
that the request is _tracked as a record_ with a status and an owner,
rather than arriving as an email that gets lost.

**Erasure is not a hard delete.** The member's account is soft-deleted
and personal data is purged or anonymised per the retention policy.
Financial records are retained for the statutory period; the member's
identifying fields are removed, the transaction record stays. Audit
entries are never deleted — they reference the user ID, which becomes a
tombstone.

**Rejections require a reason.** A request can be refused where the law
permits (e.g. legal retention obligation), but the refusal and its basis
are recorded.

## 3. Breach incidents

If personal data is exposed — a misconfigured storage bucket, a leaked
database, an unauthorised admin access — it must be recorded and, if it
poses risk, reported to the NDPC within **72 hours** of detection.

```prisma
model BreachIncident {
  id                       String        @id @default(cuid())
  detectedAt               DateTime
  description              String
  affectedCount            Int
  riskLevel                RiskLevel
  ndpcNotifiedAt           DateTime?
  dataSubjectsNotifiedAt   DateTime?
  remediationActions       String?
  status                   BreachStatus  @default(open)

  @@index([status])
  @@index([detectedAt])
}

enum RiskLevel { low  medium  high }
enum BreachStatus { open  contained  resolved  reported }
```

The `ndpcNotifiedAt` timestamp is the one that matters. The 72-hour clock
runs from `detectedAt`. Build the record so the elapsed time is visible
in the admin view — a breach sitting at 71 hours with no notification is
a regulatory failure.

**This is a manual process in Phase 1.** No automation. The value of the
entity is that when it happens, the timeline is captured, not
reconstructed from memory weeks later.

## 4. Retention

Every data category has a retention period and a deletion action.

```prisma
model RetentionPolicy {
  id                String           @id @default(cuid()) @map("id")
  dataCategory      String           @map("data_category")
  retentionMonths   Int              @map("retention_months")
  deletionAction    DeletionAction   @map("deletion_action")
  isActive          Boolean          @default(true) @map("is_active")

  @@map("retention_policy")
}

enum DeletionAction {
  hard_delete
  anonymise
  archive
}
```

Suggested starting points (client to confirm with their lawyer):

| Category               | Retention                    | Action      | Why                                    |
| ---------------------- | ---------------------------- | ----------- | -------------------------------------- |
| User profile           | Account lifetime + 12 months | Anonymise   | After erasure request                  |
| Payment records        | 7 years                      | Archive     | Financial record-keeping               |
| Payment proofs (files) | 24 months                    | Hard delete | Sensitive; no ongoing need             |
| Attendance records     | 7 years                      | Archive     | Certificate verification — see below  |
| Certificates issued    | Permanent                    | Archive     | Credential; must remain verifiable     |
| Audit logs             | 7 years                      | Archive     | Regulatory; append-only                |
| Consent records        | Account lifetime + 6 years   | Archive     | Proof of consent                       |
| Feedback               | 24 months                    | Anonymise   | Unless member consented to attribution |

**Attendance must outlive certificates.** A certificate has to remain
verifiable indefinitely, so the attendance rows that substantiate it cannot be
archived out at 5 years while the certificate still claims a 70% attendance
rate. Either both are permanent, or attendance is retained for at least as
long as any certificate referencing it. Aligning them at 7 years is the
minimum defensible answer; confirm with the client.

### `dataRetentionUntil` must not be a moving target

`User.dataRetention_until` (from §16.1) is the per-user cutoff.
**Compute it from a fixed anchor — never "last activity".** A rolling window
that resets on every login means an active member is never purged, which
defeats the erasure and anonymisation paths this table exists to support.

Recommended formulation, pending legal confirmation:

- Set once at erasure-request completion, not at registration.
- `data_retention_until = erasure_request.completed_at + retention_months`.
- Do not extend it on subsequent activity — the member has asked to be
  forgotten, and re-engagement does not undo that request.
- A member who later registers afresh is a new `User` with a new retention
  clock; do not resurrect the old row.

Phase 1 builds the schema and the policy seed. Automated enforcement runs as
a scheduled job — that job is Phase 2. Do not build a deletion scheduler yet,
but do make sure every entity that needs a retention rule has one from the
moment it is created.

## 5. Audit logs

Already covered in [security.md](../../rules/security.md), repeated here
because it is a compliance requirement, not just a debugging aid.

- Append-only. Enforce at the database level with a trigger, and revoke
  `TRUNCATE` and table ownership from the application role — a row trigger
  does not stop `TRUNCATE`.
- **Every admin action that touches member data writes an entry, including
  reads.** Staff access to a member's record is itself an auditable event.
- Never edit or delete an entry, even to correct a mistake — write a
  corrective entry instead.
- Retained for 7 years minimum.

```sql
-- Applied in the AuditLog migration. The function definition and the
-- DROP TRIGGER IF EXISTS both live in
-- .agents/skills/db-migration-runner/SKILL.md — define it once, not twice.
DROP TRIGGER IF EXISTS audit_log_immutable ON "AuditLog";
CREATE TRIGGER audit_log_immutable
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
```

This is the only definition of the trigger in the rules set. A second,
slightly different copy is how a migration ends up non-re-runnable.

## 6. Sensitive data flags

Some data carries higher risk and triggers stricter handling:

| Data                              | Sensitivity | Handling                                            |
| --------------------------------- | ----------- | --------------------------------------------------- |
| Payment proof files               | High        | Encrypted at rest, signed URLs, 24-month retention  |
| Bank details / references         | High        | Encrypted at rest                                   |
| Health data (if collected)        | Highest     | Explicit consent type, encrypted, minimal retention |
| Professional registration numbers | Medium      | Treated as personal data                            |
| General profile data              | Standard    | Consent + retention as normal                       |

`sensitive_data` is a distinct consent type. If a feature collects health
data or anything in the highest tier, it needs its own consent record —
`data_processing` consent does not cover it.

**Phase 1 does not collect health data.** If a feature is proposed that
would, stop and raise it — it changes the compliance posture materially.

## 7. Cross-border transfers

If any personal data leaves Nigeria — a US-hosted database, an analytics
provider, an email service with overseas servers — the transfer must be
recorded and lawful.

`cross_border_transfer` is a consent type, and the destination must be
tracked.

**Check before choosing infrastructure.** Where the database and file
storage physically live matters. If you pick a provider whose primary
region is outside Nigeria, note it and flag it to the client — it is not
a decision an agent should make silently.

## 8. Nigerian-specific fields

Two small rules with outsized importance:

- **Phone numbers** are Nigerian format: `+234` followed by 10 digits starting
  `0803`–`0813` (SEC-019). The regex lives **once**, in
  `lib/validation/` — it is not duplicated into feature files. Normalise
  first (strip spaces, hyphens, and a leading `0`), then validate, so
  `+234 803 123 4567` and `08031234567` are both accepted, and store the
  normalised `+2348031234567`.
- **Currency** defaults to NGN on every monetary field (SEC-020). No
  field is currency-less.

## 9. NDPC registration — the DCPMI threshold

If EHEMS processes personal data of **more than 200 data subjects within
6 months**, it must register with the Nigeria Data Protection Commission
as a Data Controller/Processor of Major Importance (DCPMI).

EHEMS's target is 500+ O'Free signups **in the first 6 months** (BO-001).
**It will cross this threshold well inside that window.** Consequences:

- Appoint a Data Protection Officer
- Conduct an annual Data Protection Compliance Audit
- File a Compliance Audit Return (CAR) annually
- Maintain records of processing activities (ROPA)

**This is a client obligation, not something the agent implements.** But
the agent should not build anything that makes it harder — and should
prompt when a feature seems to touch the DCPMI surface.

Appendix F of the PRD holds the full checklist for the client.

## Per-feature compliance checklist

Before marking any feature done, answer all six:

1. **Does it collect personal data?** If yes, what consent type covers
   it, and is that consent captured at the right moment?
2. **Does it store personal data?** If yes, what is its retention rule,
   and does a `RetentionPolicy` row exist?
3. **Does it change or delete member data?** If yes, is there an audit
   entry, and is the change reflected in `DataSubjectRequest` handling?
4. **Does it handle sensitive data?** If yes, is it encrypted, is there
   a distinct consent, and is the retention minimal?
5. **Does data leave Nigeria?** If yes, is the transfer recorded?
6. **Can a member exercise their rights over this data?** Access,
   rectification, erasure, portability — can they?

If any answer is "no" or "not sure," the feature is not done.

## Common mistakes

1. **Consent captured but not versioned.** The text changes; you can no
   longer prove what was agreed. Store the text, always.
2. **Bundling consent.** Marketing consent folded into data-processing
   consent is not valid consent. Keep them separate.
3. **Deleting consent records on withdrawal.** Destroys the proof of
   consent history. Set `withdrawnAt` instead.
4. **Hard-deleting users.** Financial records must survive; audit entries
   must survive. Erasure is anonymisation plus targeted purge, not
   `DELETE FROM User`.
5. **Building erasure as `DELETE` cascade without thought.** A cascade
   can destroy records you are legally required to keep. Erasure is a
   designed process, not a database feature.
6. **Treating payment proof as ordinary data.** It is high-sensitivity.
   Encrypted at rest, expiring access, short retention.
7. **Skipping audit on admin reads.** Access to member data by staff is
   itself an event worth logging, at least at the volume level.
8. **Assuming Phase 2 will handle it.** The schema and the flows are
   Phase 1. Retrofit is expensive. Build it now.

## What to test

- [ ] Registration creates a `ConsentRecord` with version, text, IP, UA
- [ ] Marketing consent can be declined without blocking registration
- [ ] Consent withdrawal sets `withdrawnAt` and creates no new row
- [ ] Re-consent creates a new row rather than updating the old
- [ ] A `DataSubjectRequest` can be created and tracked to completion
- [ ] Erasure anonymises the user but preserves financial records
- [ ] Erasure does not delete `AuditLog` entries
- [ ] `BreachIncident` records `detectedAt` and tracks the 72-hour window
- [ ] Every personal-data entity has a `RetentionPolicy` row in seed
- [ ] Nigerian phone validation rejects non-`+234` formats
- [ ] NGN is the default on every monetary field
- [ ] `AuditLog` rejects UPDATE and DELETE at the database level

## Done when

- [ ] The six checklist questions all have answers
- [ ] New entities have retention rules and any needed consent types
- [ ] Audit logging covers the change
- [ ] Sensitive data is flagged and handled accordingly
- [ ] Tests above pass for the feature's surface
- [ ] No new personal data path is left unaccounted for

```

```
