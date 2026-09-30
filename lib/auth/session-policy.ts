import type { RoleKey } from '@/lib/permissions/roles';

export const MEMBER_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const ADMIN_SESSION_MS = 30 * 60 * 1000;
export const ABSOLUTE_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export function inactivityWindowMs(role: RoleKey | null): number {
  return role === 'admin' || role === 'super_admin' ? ADMIN_SESSION_MS : MEMBER_SESSION_MS;
}

export function sessionExpiryAfterActivity(
  now: Date,
  role: RoleKey | null,
  absoluteExpiresAt: Date,
): Date {
  return new Date(Math.min(now.getTime() + inactivityWindowMs(role), absoluteExpiresAt.getTime()));
}
