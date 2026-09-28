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
import { getCurrentUser, type SessionUser, type UserRole } from './index';

function toLogin(): never {
  redirect(`/login?error=${encodeURIComponent('Please sign in to continue.')}`);
}

/** The current user, or a redirect to the login page. */
export async function requireSession(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) toLogin();
  return user;
}

/** The current user, but only if they hold one of `allowed`. Least privilege: pass every role that may proceed, never "admin or above". */
export async function requireRole(...allowed: UserRole[]): Promise<SessionUser> {
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
