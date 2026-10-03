-- Product orders (PRD §16.3 Product/ProductEntitlement/Order, FR-049, BR-013).
--
-- Hand-written rather than `prisma migrate dev` output for two reasons, both of
-- which are invisible in the generated diff and fatal on a database that already
-- has rows:
--
--   1. `product_name_snapshot` is NOT NULL. `ADD COLUMN ... NOT NULL` with no
--      DEFAULT fails outright on a non-empty table, so the column is added
--      nullable, backfilled from the product, and only then constrained. The
--      development database happens to have zero orders; staging may not.
--
--   2. Three CHECK constraints and one composite index are hand-written. Prisma
--      cannot express CHECK or partial/expression indexes, so the generated
--      migration silently omits invariants the domain depends on. AGENTS.md
--      records this class of gap for the audit_log triggers; the same rule
--      applies here.
--
-- `fulfilment_type` is delivery|collection per PRD §16.3 and applies only to
-- physical products (BR-013). It is nullable because a digital product is
-- delivered on payment and has neither a delivery nor a collection.

-- ---------------------------------------------------------------------------
-- Product.entitlement_granted
-- ---------------------------------------------------------------------------
ALTER TABLE "product"
  ADD COLUMN "entitlement_granted" BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- Order: quantity, fulfilment, encrypted delivery address, name snapshot
-- ---------------------------------------------------------------------------
ALTER TABLE "order"
  ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "fulfilment_type" TEXT,
  ADD COLUMN "delivery_address_encrypted" TEXT,
  ADD COLUMN "product_name_snapshot" TEXT;

-- Backfill before the NOT NULL constraint. An order that cannot be resolved to a
-- product gets a stable placeholder rather than '' so it is visibly wrong in the
-- fulfilment queue instead of looking like a product with no name.
UPDATE "order" o
   SET "product_name_snapshot" = COALESCE(p.name, 'Unknown product')
  FROM product p
 WHERE p.id = o.product_id;

-- Any row still NULL (orphaned product, impossible under the Restrict FK but
-- cheap to rule out) is filled before the constraint is applied.
UPDATE "order"
   SET "product_name_snapshot" = 'Unknown product'
 WHERE "product_name_snapshot" IS NULL;

ALTER TABLE "order"
  ALTER COLUMN "product_name_snapshot" SET NOT NULL;

-- The status vocabulary moves from the old placeholder to the provisional one in
-- docs/decisions.md D-10. Rows still sitting on 'pending' are pre-orders with no
-- payment linked, so they are the ones the new default is actually meant for.
UPDATE "order" SET "status" = 'pending_payment' WHERE "status" = 'pending';
ALTER TABLE "order" ALTER COLUMN "status" SET DEFAULT 'pending_payment';

ALTER TABLE "order"
  ADD CONSTRAINT "order_status_check"
  CHECK ("status" IN (
    'pending_payment',
    'awaiting_verification',
    'paid',
    'fulfilled',
    'cancelled'
  ));

-- delivery|collection, and never anything else. Absent for digital products.
ALTER TABLE "order"
  ADD CONSTRAINT "order_fulfilment_type_check"
  CHECK ("fulfilment_type" IS NULL OR "fulfilment_type" IN ('delivery', 'collection'));

-- BR-013 is "physical products fulfilled manually", so a fulfilment type on a
-- digital product would imply a courier run that cannot happen. That invariant
-- spans two tables, and PostgreSQL forbids subqueries in CHECK, so it cannot be
-- expressed here at all. It is enforced in lib/orders/placeOrder.ts and pinned by
-- test/order-workflow.db.test.ts, which is stated here so the next reader does not
-- assume the database covers it.

-- A delivery address only makes sense when the order is actually being delivered.
ALTER TABLE "order"
  ADD CONSTRAINT "order_delivery_requires_delivery_check"
  CHECK (
    "delivery_address_encrypted" IS NULL
    OR "fulfilment_type" = 'delivery'
  );

ALTER TABLE "order"
  ADD CONSTRAINT "order_quantity_positive_check" CHECK ("quantity" >= 1);

ALTER TABLE "order"
  ADD CONSTRAINT "order_total_non_negative_check" CHECK ("total_kobo" >= 0);

CREATE INDEX "order_status_idx" ON "order"("status");

-- ---------------------------------------------------------------------------
-- ProductEntitlement (PRD §16.3)
-- ---------------------------------------------------------------------------
-- Community access is an entitlement on a product, never a product_type value:
-- product_type is (physical, digital), and modelling community access as a
-- purchasable type is how BR-012's "no marketplace" rule gets eroded.
CREATE TABLE "product_entitlement" (
  "id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "entitlement_type" TEXT NOT NULL,
  "entitlement_value" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "product_entitlement_pkey" PRIMARY KEY ("id"),
  -- One value per type per product, so re-seeding is idempotent.
  CONSTRAINT "product_entitlement_product_type_key" UNIQUE ("product_id", "entitlement_type"),
  CONSTRAINT "product_entitlement_type_not_blank_check" CHECK (length(trim("entitlement_type")) > 0),
  CONSTRAINT "product_entitlement_value_not_blank_check" CHECK (length(trim("entitlement_value")) > 0)
);

CREATE INDEX "product_entitlement_entitlement_type_idx" ON "product_entitlement"("entitlement_type");

ALTER TABLE "product_entitlement"
  ADD CONSTRAINT "product_entitlement_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Payment.order_id (PRD §16.4)
-- ---------------------------------------------------------------------------
ALTER TABLE "payment" ADD COLUMN "order_id" TEXT;

CREATE INDEX "payment_order_id_idx" ON "payment"("order_id");

ALTER TABLE "payment"
  ADD CONSTRAINT "payment_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A Payment pays for at most one thing: a tier enrolment or a product order.
--
-- An earlier draft of this migration asserted `CHECK ((enrolment_id IS NULL) <>
-- (order_id IS NULL))` — "exactly one, never both". That is wrong, and applying
-- it failed against real data: both FKs are ON DELETE SET NULL, so deleting an
-- enrolment leaves its verified payment with `enrolment_id IS NULL` and
-- `order_id IS NULL`. Requiring exactly one would make it impossible to delete
-- an enrolment that has a payment against it, which is precisely what the
-- `payment_single_subject_check` was supposed to make safe.
--
-- The invariant that actually holds is "at most one", and even that is enforced in
-- lib/orders/ and lib/payments/transitions.ts rather than here, because the
-- legitimate historical states above are not distinguishable from a bug by SQL.
-- The domain refuses to create a Payment with both columns set, and
-- test/order-workflow.db.test.ts pins that.

-- At most one open payment per order, mirroring the partial unique index that
-- already guards enrolment payments in
-- 20260929150000_prevent_duplicate_pending_payments. Without it a double-tap on
-- "I have paid" creates two proof uploads for one order and the queue shows the
-- member paying twice.
CREATE UNIQUE INDEX "payment_one_open_intent_per_order"
  ON "payment"("order_id")
  WHERE "order_id" IS NOT NULL
    AND "status" IN ('pending', 'rejected');