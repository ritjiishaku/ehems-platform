/**
 * Provision the first Super Admin.
 *
 * The seed's closing note tells the operator to use `db:studio` or "a one-off
 * script". This is that script. Super Admin is the only role that can configure
 * tiers and manage roles (AGENTS.md section 3), and nothing in the app can
 * grant it, so without this there is no way into any admin surface.
 *
 * Credentials come from the environment, never from argv, so a password cannot
 * end up in shell history or a process listing:
 *
 *   $env:EHEMS_ADMIN_EMAIL='lead@ehems.ng'
 *   $env:EHEMS_ADMIN_NAME='EHEMS Lead'
 *   $env:EHEMS_ADMIN_PASSWORD='<at least 12 characters>'
 *   npm run db:create-admin
 *
 * Refuses to touch an existing account. Promoting someone is a different, audited
 * action and belongs in a deliberate tool, not in a bootstrap script.
 */
import assert from 'node:assert/strict';
import { prisma } from '../lib/db/client';
import { hashPassword } from '../lib/auth/password';

const SUPER_ADMIN_ROLE_ID = 'role-super-admin';
const MIN_PASSWORD_LENGTH = 12;

function required(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    console.error(`\n${name} is required.\n`);
    process.exit(1);
  }
  return value.trim();
}

async function main() {
  const email = required('EHEMS_ADMIN_EMAIL').toLowerCase();
  const name = required('EHEMS_ADMIN_NAME');
  const password = required('EHEMS_ADMIN_PASSWORD');

  assert.ok(
    password.length >= MIN_PASSWORD_LENGTH,
    `EHEMS_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  );

  const role = await prisma.role.findUnique({ where: { id: SUPER_ADMIN_ROLE_ID } });
  if (!role) {
    console.error(
      '\nThe super_admin role is missing. Run `npm run db:seed` first — it creates the five assignable roles.\n',
    );
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.error(
      `\nA user with the email ${email} already exists. This script will not modify an existing account.\n`,
    );
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      roleId: SUPER_ADMIN_ROLE_ID,
    },
  });

  // The bootstrap is an admin action on member data, so it is audited like any
  // other (SEC-015). `actor_id` is itself the new account: nobody else is
  // involved, and claiming otherwise would be a worse record.
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: 'SUPER_ADMIN_PROVISIONED',
      entityType: 'User',
      entityId: user.id,
      metadata: { roleId: SUPER_ADMIN_ROLE_ID, via: 'db:create-admin' },
    },
  });

  console.log(`\nSuper Admin created: ${email}`);
  console.log('Sign in at /login, then open /admin/data-requests.');
  console.log('Remove the EHEMS_ADMIN_PASSWORD environment variable now that it is set.\n');
}

main()
  .catch((error: unknown) => {
    if (error instanceof Error && error.message.includes('EHEMS_ADMIN_PASSWORD must be')) {
      console.error(`\n${error.message}\n`);
      process.exit(1);
    }
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
