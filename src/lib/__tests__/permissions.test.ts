import { describe, expect, it } from 'vitest';
import { canSee, isAdmin } from '../permissions';
import type { AppUser } from '../types';

const user = (overrides: Partial<AppUser>): AppUser => ({
  username: 'tester',
  role: 'USER',
  access: '',
  ...overrides,
});

describe('permissions', () => {
  it('grants all access to ADMIN role', () => {
    const admin = user({ role: 'ADMIN' });
    expect(isAdmin(admin)).toBe(true);
    expect(canSee(admin, 'DASHBOARD')).toBe(true);
    expect(canSee(admin, 'SETTINGS')).toBe(true);
  });

  it('grants approval menu to manager/director role aliases', () => {
    expect(canSee(user({ role: 'Manager' }), 'APPROVAL')).toBe(true);
    expect(canSee(user({ divisionCode: 'DIR' }), 'APPROVAL')).toBe(true);
  });

  it('uses comma-separated explicit access for regular users', () => {
    const regular = user({ access: 'CREATE PR, PR HISTORY' });
    expect(canSee(regular, 'CREATE PR')).toBe(true);
    expect(canSee(regular, 'PURCHASE')).toBe(false);
  });
});
