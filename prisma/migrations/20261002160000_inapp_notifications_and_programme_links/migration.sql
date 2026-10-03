-- In-app notifications (CR-07 / PRD §18.2 FR-055-060) and programme-scoped
-- community links.
--
-- Hand-written for the same reasons as 20261002143000: the generated diff would
-- emit `ADD COLUMN ... NOT NULL` with no default, and cannot express the CHECK
-- below. `notification` and `community_link` both carry rows in a long-lived
-- database, so "the table happens to be empty" is not an assumption worth making.

-- ---------------------------------------------------------------------------
-- Notification.readAt — the in-app read marker
-- ---------------------------------------------------------------------------
ALTER TABLE "notification" ADD COLUMN "read_at" TIMESTAMP(3);

-- A row cannot be both delivered and failed. Every consumer of this table
-- branches on exactly one of these, and a row claiming both is a bug that would
-- render as a phantom unread message.
ALTER TABLE "notification"
  ADD CONSTRAINT "notification_sent_or_failed_check"
  CHECK (NOT ("sent_at" IS NOT NULL AND "failed_at" IS NOT NULL));

-- Reading requires delivery. Without this an in-app row could be marked read
-- while never having been shown to anyone.
ALTER TABLE "notification"
  ADD CONSTRAINT "notification_read_requires_sent_check"
  CHECK ("read_at" IS NULL OR "sent_at" IS NOT NULL);

-- The dashboard badge counts unread in-app rows, so this composite index is the
-- hot path. Plain `read_at IS NULL` would also match every email ever sent.
CREATE INDEX "notification_user_inapp_created_idx"
  ON "notification"("user_id", "created_at" DESC);

-- ---------------------------------------------------------------------------
-- CommunityLink.programmeId — scope a link to one programme
-- ---------------------------------------------------------------------------
-- Single programme, not a join table. Whether a member enrolled in several
-- programmes should see a link pinned to two of them is unanswered, and a join
-- table would force that decision at read time (D-28).
ALTER TABLE "community_link" ADD COLUMN "programme_id" TEXT;

CREATE INDEX "community_link_programme_id_idx" ON "community_link"("programme_id");

ALTER TABLE "community_link"
  ADD CONSTRAINT "community_link_programme_id_fkey"
  FOREIGN KEY ("programme_id") REFERENCES "programme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BR-011 gives every tier general community access, so a programme pin narrows
-- access and must never stand in for it: an `ehems_open_sales` link pinned to a
-- programme is still withheld from Basic Level. That is enforced by intersecting
-- both conditions in lib/member/entitlement.ts rather than by the database,
-- because the tier rule depends on the member's enrolments.