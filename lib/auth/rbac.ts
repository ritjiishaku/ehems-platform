/**
 * Server-side route guards (AGENTS.md §7).
 *
 * Hiding a link is not access control. Every protected route and server action
 * calls one of these before it parses a body, and the check runs on the server
 * so it cannot be skipped by crafting a request.
 *
 * All three redirect rather than throw: a redirect is what an unauthenticated
 * browser should get, and `redirect()` returns `never`, so the compiler still
 * treats the guard as total.
 */

import { redirect } from 'next/navigation';
import { isRoleKey, type RoleKey } from '@/lib/permissions';
import { getCurrentUser, type SessionUser } from './index';

function toLogin(): never {
  redirect(`/login?error=${encodeURIComponent('Please sign in to continue.')}`);
}

/**
 * A session role string → a RoleKey, or null.
 *
 * The session still reads a role from the database, but the value is only
 * trusted as a *name* and is re-validated against the in-code role table. An
 * unrecognised value yields null, which means no permissions — so a role row
 * deleted out from under a live session, or a stale value from before a rename,
 * denies access rather than granting it. The failure direction matters: the
 * alternative (falling back to `member`) would silently downgrade an admin whose
 * role name changed.
 */
function _roleOf(user: SessionUser): RoleKey | null {
  return isRoleKey(user.role) ? user.role : null;
}

/** The current user, or a redirect to the login page. */
export async function requireSession(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) toLogin();
  return user;
}

/** The current user, but only if they hold one of `allowed`. Least privilege: pass every role that may proceed, never "admin or above". */
export async function requireRole(...allowed: RoleKey[]): Promise<SessionUser> {
  const user = await requireSession();
  if (!allowed.includes(user.role)) {
    redirect(`/dashboard?error=${encodeURIComponent('You do not have access to that area.')}`);
  }
  return user;
}

/** The current user, but only if they own `resourceOwnerId`. Re-checked on every route, never cached into a prop. */
export async function requireOwnership(resourceOwnerId: string): Promise<SessionUser> {
  const user = await requireSession();
  if (user.id !== resourceOwnerId) {
    redirect(`/dashboard?error=${encodeURIComponent('You do not have access to that area.')}`);
  }
  return user;
}

/**
 * The current user if there is one, otherwise null. For surfaces that render
 * differently when signed in but are not themselves protected — never as a
 * substitute for `requireSession` on a protected route.
 */
export async function getOptionalUser(): Promise<SessionUser | null> {
  return getCurrentUser();
}
