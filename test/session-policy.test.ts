import { describe, expect, it } from 'vitest';
import {
  ADMIN_SESSION_MS,
  ABSOLUTE_SESSION_MS,
  MEMBER_SESSION_MS,
  inactivityWindowMs,
  sessionExpiryAfterActivity,
} from '@/lib/auth/session-policy';

describe('session policy', () => {
  it('uses the confirmed inactivity windows for members and admins', () => {
    expect(inactivityWindowMs('member')).toBe(7 * 24 * 60 * 60 * 1000);
    expect(inactivityWindowMs('mentor')).toBe(MEMBER_SESSION_MS);
    expect(inactivityWindowMs('admin')).toBe(30 * 60 * 1000);
    expect(inactivityWindowMs('super_admin')).toBe(ADMIN_SESSION_MS);
    expect(inactivityWindowMs(null)).toBe(MEMBER_SESSION_MS);
  });

  it('slides the inactivity expiry but never passes the absolute cap', () => {
    const now = new Date('2026-09-28T12:00:00.000Z');
    const absolute = new Date(now.getTime() + ABSOLUTE_SESSION_MS);

    expect(sessionExpiryAfterActivity(now, 'admin', absolute).getTime()).toBe(
      now.getTime() + ADMIN_SESSION_MS,
    );
    expect(sessionExpiryAfterActivity(now, 'member', absolute).getTime()).toBe(
      now.getTime() + MEMBER_SESSION_MS,
    );

    const nearCap = new Date(absolute.getTime() - 5 * 60 * 1000);
    expect(sessionExpiryAfterActivity(nearCap, 'member', absolute)).toEqual(absolute);
  });
});
