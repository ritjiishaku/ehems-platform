---
name: db-migration-runner
description: Create and run a Prisma migration for EHEMS. Use when changing the schema — adding entities, altering fields, or modifying the domain model in PRD §16.
---

# DB Migration Runner

## Before you migrate

1. **Check PRD §16.** If the entity already exists in the spec, match its
   fields exactly. Do not invent a variant. If §16 has no entity for what you
   need, that is a spec gap — raise it, do not quietly model it.
2. **Is this a Phase 1 concern?** The full fence is in
   [architecture.md](../../rules/architecture.md): payment gateway, QR
   attendance, automated scoring, certificate auto-generation, internship
   module, mentor dashboards, feedback analytics, Telegram bot, event
   capacity, in-app community, PWA, i18n, referrals, marketplace. None of them
   get a migration in Phase 1 — even though §16 contains `Internship` and
   `InternshipApplication` models, they are not created now.
3. **Does it carry personal data?** If yes, it needs a consent type, a
   retention period, and audit coverage. See
   [security.md](../../rules/security.md).

## Workflow

Prisma is installed and the repository uses npm. For a local development
database, follow this sequence; do not apply migrations to staging or production
from an agent session.

```bash
# 1. Edit prisma/schema.prisma
# 2. Generate and apply the local development migration
npm run db:migrate -- --name add_consent_record

# 3. Inspect the generated SQL before committing
#    prisma/migrations/<timestamp>_<name>/migration.sql

# 4. Regenerate the client
npm run db:generate

# 5. Update the seed if the change affects tiers, certificates, roles,
#    permissions, system settings, or retention policies
npm run db:seed

# 6. Verify
npm run verify
```

The repo is **npm**. Use the package scripts so the project Prisma/seed
configuration is applied consistently.

Never use `prisma db push` outside throwaway local work. Migrations are
the source of truth.

## Naming

`snake_case`, verb-first, descriptive: `add_consent_record`,
`add_payment_proof_url`, `retire_tiers_ii_vi_vii`.

## Rules

- **Never edit a committed migration.** Add a new one.
- **Never drop a column with data without a backfill plan.** Two-step:
  add new → backfill → switch reads → drop old in a later migration.
- **Additive first.** Add nullable columns before making them required.
- **Every relation needs both sides.** Prisma validates relation integrity at
  generate time; a `@relation` on one model with no matching field on the
  other fails `prisma validate`.
- **Map every field and model.** Database names are `snake_case`; Prisma models
  are camelCase and require explicit `@map` / `@@map`. Without it the physical
  schema is camelCase and will not match PRD §16.
- **Every FK gets an index.** Prisma does not always add one.
- **Every soft-deletable table gets `deleted_at` and an index on it.**
- **Money is `Int` (kobo)** or `Decimal`. Never `Float`.
- **Timestamps** are `DateTime`, UTC.
- **Enums are generated Prisma enums, not strings.** A bare `"active"` in a
  `where` clause only compiles against a generated enum type — import it
  rather than writing a string literal.

## The Payment model

Matches PRD §16.4, plus the `opened_by` / `reviewed_by` attribution the
verification workflow requires (a row trigger cannot carry it). Manual
verification only — no gateway fields.

```prisma
model Payment {
  id                String         @id @default(cuid()) @map("id")
  userId            String         @map("user_id")
  enrolmentId       String?        @map("enrolment_id")
  orderId           String?        @map("order_id")

  amountKobo        Int            @map("amount_kobo")
  currency          String         @default("NGN") @map("currency")

  // manual payment details. Nullable while status = pending, which is
  // defined as "created, awaiting proof upload" — a pending payment
  // therefore cannot require a reference or a proof.
  paymentMethod     String?        @map("payment_method")
  paymentReference  String?        @map("payment_reference")
  bankName          String?        @map("bank_name")
  transferDate      DateTime?      @map("transfer_date")
  proofUrl          String?        @map("proof_url")

  status            PaymentStatus  @default(pending) @map("status")
  submittedAt       DateTime?      @map("submitted_at")
  openedBy          String?        @map("opened_by")
  underReviewedAt   DateTime?      @map("under_reviewed_at")
  verifiedAt        DateTime?      @map("verified_at")
  verifiedBy        String?        @map("verified_by")
  rejectionReason   String?        @map("rejection_reason")

  createdAt         DateTime       @default(now()) @map("created_at")
  updatedAt         DateTime       @updatedAt @map("updated_at")

  user              User           @relation(fields: [userId], references: [id], onDelete: Restrict)
  enrolment         Enrolment?     @relation(fields: [enrolmentId], references: [id], onDelete: SetNull)
  order             Order?         @relation(fields: [orderId], references: [id], onDelete: SetNull)
  openedByUser      User?          @relation("PaymentOpenedBy", fields: [openedBy], references: [id], onDelete: SetNull)
  verifiedByUser    User?          @relation("PaymentVerifiedBy", fields: [verifiedBy], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([status])
  @@index([enrolmentId])
  @@map("payment")
}

enum PaymentStatus {
  pending       // created, awaiting proof upload
  submitted     // proof uploaded, in the verification queue
  under_review  // admin has opened it
  verified      // approved — activates the enrolment
  rejected      // rejected with reason; member may resubmit
}
```

The five statuses are the PRD's vocabulary (§14.3), stored in snake_case. Do
not rename, add, or collapse them.

The matching back-references must exist on the other models, or
`prisma generate` fails:

```prisma
// on User
payments            Payment[]  @relation("PaymentUser")
paymentsOpened      Payment[]  @relation("PaymentOpenedBy")
paymentsVerified    Payment[]  @relation("PaymentVerifiedBy")

// on Enrolment
payment             Payment?

// on Order
payment             Payment?
```

`Order` is a Phase 1 entity (PRD §16.4) and must be modelled for any of this
to validate. It is not currently specified in enough detail to write — see
[docs/decisions.md](../../../docs/decisions.md).

**Do not add** `channel`, `providerReference`, `providerStatus`, or any
other gateway-shaped field. Phase 2 will add those in their own migration
when the gateway actually arrives. Speculative columns rot.

## Append-only tables

`AuditLog` must reject UPDATE and DELETE at the database level, not just
by convention. Add in the migration:

```sql
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
  RETURN NULL;  -- unreachable: the RAISE above always fires
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_immutable ON "AuditLog";
CREATE TRIGGER audit_log_immutable
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
```

`DROP TRIGGER IF EXISTS` matters: without it the migration is not re-runnable
and `prisma migrate reset` errors.

A row trigger does **not** stop `TRUNCATE` or a `DROP TABLE`. Those also need
revoking from the application role:

```sql
REVOKE TRUNCATE ON "AuditLog" FROM PUBLIC;
REVOKE ALL ON "AuditLog" FROM <app_role>;
GRANT SELECT, INSERT ON "AuditLog" TO <app_role>;
```

## Seed data is a contract

`prisma/seed.ts` must produce exactly:

- The six tiers from PRD §11.1, named exactly as written there (including
  "Level"), with correct `display_order` and prices in kobo.
- **Not** Tiers II, VI, VII. They are retired (BR-016).
- The approved certificate catalogue. D-5 confirms 27 total, but the PRD and
  current seed enumerate 26 names; do not add an invented row before the client
  supplies the missing name and tier mapping.
- The **five assignable roles** confirmed in D-3: Visitor, Member, Mentor,
  Admin, and Super Admin. Other PRD role concepts are derived from account or
  domain state. D-12 records hardcoded permission checks for these five roles;
  no Phase 1 `RolePermission` table is used.
- `SystemSetting` rows.
- A `RetentionPolicy` row for every personal-data category (SEC-016).

The seed is what the client sees on first login. Treat a change to it as
a client-visible change.

## Staging and production

- Migrations run as a deploy step, not manually.
- Never run `migrate reset` against anything but a local database.
- Take a backup before any destructive migration.
- Test the migration against a production-shaped dataset first.

