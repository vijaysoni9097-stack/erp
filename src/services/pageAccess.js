export const pharmacistPages = ['/dispense', '/medicines', '/orders', '/settings'];
export function canAccessPage(role, pathname) {
  if (role !== 'pharmacist') return true;
  return pharmacistPages.some(path => pathname === path || (path === '/settings' && pathname.startsWith('/settings/')));
}
