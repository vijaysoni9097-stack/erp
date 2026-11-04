import assert from 'node:assert/strict';
import { canAccessPage, canImportData } from '../src/services/pageAccess.js';
for (const role of ['doctor', 'admin', 'pharmacist', 'nurse', 'receptionist', undefined]) {
  assert.equal(canImportData(role), false);
  for (const path of ['/settings/import', '/settings/import/']) assert.equal(canAccessPage(role, path), false);
}
assert.equal(canImportData('superadmin'), true);
assert.equal(canAccessPage('superadmin', '/settings/import'), true);
for (const path of ['/dispense', '/medicines', '/orders', '/settings', '/settings/profile', '/settings/password']) assert.equal(canAccessPage('pharmacist', path), true, path);
for (const path of ['/dashboard', '/stock-management', '/suppliers', '/purchase-orders', '/expiry-alerts', '/transfers', '/messages', '/users', '/machines', '/settings-other']) assert.equal(canAccessPage('pharmacist', path), false, path);
for (const role of ['admin', 'superadmin']) assert.equal(canAccessPage(role, '/dashboard'), true);
console.log('Page access checks passed: pharmacists restricted to four sections, including settings subpages.');
