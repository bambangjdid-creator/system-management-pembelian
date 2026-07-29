import type { AppUser } from './types';

export function isAdmin(user?: AppUser | null) {
  const role = String(user?.role || '').toUpperCase();
  const divCode = String(user?.divisionCode || user?.divCode || '').toUpperCase().trim();
  return role.includes('ADMIN') || divCode === 'ADMIN';
}

export function canSee(user: AppUser | null | undefined, menu: string) {
  if (!user) return false;
  const role = String(user.role || '').toUpperCase();
  if (isAdmin(user)) return true;

  const menuUp = menu.toUpperCase();
  const divCode = String(user.divisionCode || user.divCode || '').toUpperCase();

  if (menuUp === 'APPROVAL') {
    const isApprover = role.includes('MANAGER') || role.includes('MANAJER') ||
      role.includes('DIREKTUR') || role.includes('DIREKSI') ||
      role.includes('MGR') || role.includes('DIR') ||
      role.includes('KABAG') || role.includes('KADIV') ||
      divCode === 'MGR' || divCode === 'DIR';
    if (isApprover) return true;
  }

  if (['PR HISTORY', 'PO HISTORY', 'DASHBOARD'].includes(menuUp)) {
    const isHighLevel = role.includes('MANAGER') || role.includes('MANAJER') ||
      role.includes('DIREKTUR') || role.includes('DIREKSI') ||
      role.includes('MGR') || role.includes('DIR') ||
      role.includes('ADMIN') || role.includes('PURCHASE') ||
      divCode === 'MGR' || divCode === 'DIR';
    if (isHighLevel) return true;
  }

  const accessList = String(user.access || '').toUpperCase().split(',').map(m => m.trim());
  return accessList.includes(menuUp);
}
