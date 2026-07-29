import type { AppUser } from './types';

const normalize = (value: unknown) => String(value || '').trim().toUpperCase();
const accessList = (value: unknown) => normalize(value).split(',').map(m => m.trim().replace(/^"|"$/g, '')).filter(Boolean);

export function isAdmin(user?: AppUser | null) {
  const role = normalize(user?.role);
  const divCode = normalize(user?.divisionCode || user?.divCode);
  return role.includes('ADMIN') || divCode === 'ADMIN';
}

export function isApprover(user?: AppUser | null) {
  const role = normalize(user?.role);
  const divCode = normalize(user?.divisionCode || user?.divCode);
  return role.includes('MANAGER') || role.includes('MANAJER') ||
    role.includes('DIREKTUR') || role.includes('DIREKSI') ||
    role.includes('MGR') || role.includes('DIR') ||
    role.includes('KABAG') || role.includes('KADIV') ||
    divCode === 'MGR' || divCode === 'DIR';
}

export function isPurchase(user?: AppUser | null) {
  const role = normalize(user?.role);
  const divCode = normalize(user?.divisionCode || user?.divCode);
  return role.includes('PURCHASE') || role.includes('PURCHASING') || divCode === 'PUR' || divCode === 'PCH';
}

export function canSee(user: AppUser | null | undefined, menu: string) {
  if (!user) return false;
  if (isAdmin(user)) return true;

  const menuUp = normalize(menu);
  const explicitAccess = accessList(user.access);
  if (explicitAccess.includes(menuUp)) return true;

  // Safe defaults to avoid a blank app when ACCESS is empty or imported with bad CSV quoting.
  // Sensitive actions are still protected server-side by role/session middleware.
  if (['DASHBOARD', 'PR HISTORY', 'PO HISTORY', 'CREATE PR'].includes(menuUp)) return true;
  if (menuUp === 'APPROVAL') return isApprover(user);
  if (menuUp === 'PURCHASE') return isPurchase(user);
  if (menuUp === 'SETTINGS') return false;

  return false;
}
