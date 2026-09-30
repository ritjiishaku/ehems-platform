-- A member may have many historical payments, but only one open purchase
-- intent at a time. The application lookup makes ordinary retries idempotent;
-- this partial unique index closes the check-then-create race between two tabs.
CREATE UNIQUE INDEX "payment_one_pending_per_user"
ON "payment" ("user_id")
WHERE "status" = 'pending';
