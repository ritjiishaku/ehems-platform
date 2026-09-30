-- =============================================================================
-- add_rbac — Role, Permission, RolePermission, UserRole  (D-3, D-12)
--
-- Hand-edited. `prisma migrate dev` generated
--   ALTER TABLE "user" DROP COLUMN "role", ADD COLUMN "role_id" TEXT;
-- which destroys every user's role before the replacement exists. Phase 1 has no
-- production data, but the local and staging databases DO have registered users,
-- and a migration that silently empties a column is the kind of thing that gets
-- copied into a migration that matters. The order here is rename, backfill, drop.
--
-- This migration was authored before the client confirmed the five-role model.
-- The role backfill below preserves the three legacy role values it can map;
-- the current seed adds the five approved assignable roles. The following
-- Phase 2B migration drops the provisional Permission/RolePermission tables per
-- D-12. Authorization now uses the hardcoded five-role matrix.
-- =============================================================================

-- CreateTable
CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_permission" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role_id","permission_id")
);

CREATE TABLE "user_role" (
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" TEXT,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_name_key" ON "role"("name");
CREATE UNIQUE INDEX "permission_name_key" ON "permission"("name");
CREATE UNIQUE INDEX "permission_resource_action_key" ON "permission"("resource", "action");
CREATE INDEX "role_permission_permission_id_idx" ON "role_permission"("permission_id");
CREATE INDEX "user_role_role_id_idx" ON "user_role"("role_id");
CREATE INDEX "user_role_assigned_by_idx" ON "user_role"("assigned_by");

-- -----------------------------------------------------------------------------
-- Migrate the role column.
--
-- Renamed rather than dropped so the values survive long enough to be mapped.
-- The three Role rows are inserted here with the same deterministic ids the seed
-- uses, because the backfill needs something to point at and the seed has not run
-- yet. ON CONFLICT DO NOTHING makes this safe if the seed has already run — the
-- order is migration-then-seed on a fresh database, but re-running either must
-- not fail.
--
-- 'super-admin' → 'super_admin': the code-safe key. Role.name is a key, not a
-- label; Role.label carries "Super Admin" for display. This is a new convention
-- introduced here, and it is why the old value has a mapping rather than being
-- reused verbatim.
-- -----------------------------------------------------------------------------
ALTER TABLE "user" RENAME COLUMN "role" TO "role_legacy";

INSERT INTO "role" ("id", "name", "label", "is_system") VALUES
  ('role-member',      'member',      'Member (Mentee)',        true),
  ('role-admin',       'admin',       'Admin',                  true),
  ('role-super-admin', 'super_admin', 'Super Admin',            true)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "user" ADD COLUMN "role_id" TEXT;

UPDATE "user" u
   SET "role_id" = CASE u."role_legacy"
     WHEN 'member'      THEN 'role-member'
     WHEN 'admin'       THEN 'role-admin'
     WHEN 'super-admin' THEN 'role-super-admin'
     ELSE NULL
   END;

-- Every registered user in Phase 1 is a member, but role_legacy is NOT NULL and
-- its @default was "member", so an unrecognised value can only come from a manual
-- write. Those users are left with role_id NULL — no permissions — rather than
-- being guessed into a role. Surfaced by verify-seed.sql if any exist.
ALTER TABLE "user" DROP COLUMN "role_legacy";

-- Seed the grant history alongside the current role, so the two agree.
--
-- user_role is AUDIT TRAIL ONLY: an authorisation check reads user.role_id and
-- never this table. A user promoted member -> mentor keeps both rows here, so
-- deriving permissions from it would grant the union of both roles rather than
-- the current one.
INSERT INTO "user_role" ("user_id", "role_id", "assigned_by")
SELECT u."id", u."role_id", NULL
  FROM "user" u
 WHERE u."role_id" IS NOT NULL
ON CONFLICT ("user_id", "role_id") DO NOTHING;

CREATE INDEX "user_role_id_idx" ON "user"("role_id");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
