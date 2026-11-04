export const pharmacistPages = ['/dispense', '/medicines', '/orders', '/settings'];
export const canImportData = role => role === 'superadmin';
export function canAccessPage(role, pathname) {
  if (pathname === '/settings/import' || pathname.startsWith('/settings/import/')) return canImportData(role);
  if (role !== 'pharmacist') return true;
  return pharmacistPages.some(path => pathname === path || (path === '/settings' && pathname.startsWith('/settings/')));
}
