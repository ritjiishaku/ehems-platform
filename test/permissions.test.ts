import { describe, expect, it } from 'vitest';
import {
  can,
  hasPermission,
  PERMISSION_LIST,
  ROLE_KEYS,
  ROLES,
  isRoleKey,
  permissionsFor,
  roleId,
} from '@/lib/permissions';

describe('the assignable role catalogue', () => {
  it('contains only the five client-approved assignable roles', () => {
    expect(ROLE_KEYS).toEqual(['visitor', 'member', 'mentor', 'admin', 'super_admin']);
    expect(Object.values(ROLES).map((role) => role.key)).toEqual(ROLE_KEYS);
  });

  it('uses persisted role names as canonical role keys', () => {
    expect(isRoleKey('super_admin')).toBe(true);
    expect(isRoleKey('superAdmin')).toBe(false);
    expect(roleId('super_admin')).toBe('role-super-admin');
  });
});

describe('the hardcoded Phase 1 permission matrix', () => {
  it('grants Super Admin-only capabilities only to the canonical super_admin key', () => {
    expect(can({ role: 'super_admin' }, 'configureTiers')).toBe(true);
    expect(can({ role: 'admin' }, 'configureTiers')).toBe(false);
    expect(can({ role: 'super_admin' }, 'manageRoles')).toBe(true);
  });

  it('denies unknown permissions and unassigned roles', () => {
    expect(hasPermission({ role: 'admin' }, 'permission.that.does.not.exist')).toBe(false);
    expect(hasPermission({ role: null }, 'site.view')).toBe(false);
  });

  it('grants every permission only to approved role keys', () => {
    for (const permission of PERMISSION_LIST) {
      for (const role of permission.grantedTo) {
        expect(ROLE_KEYS).toContain(role);
      }
    }
  });

  it('returns the full permission set for a Super Admin using the stored key', () => {
    expect(permissionsFor({ role: 'super_admin' })).toContain('tier.configure');
    expect(permissionsFor({ role: 'super_admin' })).toContain('role.manage');
  });
});
