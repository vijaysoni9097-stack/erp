import assert from 'node:assert/strict';
import { canAccessPage } from '../src/services/pageAccess.js';
for (const path of ['/dispense', '/medicines', '/orders', '/settings', '/settings/profile', '/settings/password']) assert.equal(canAccessPage('pharmacist', path), true, path);
for (const path of ['/dashboard', '/stock-management', '/suppliers', '/purchase-orders', '/expiry-alerts', '/transfers', '/messages', '/users', '/machines', '/settings-other']) assert.equal(canAccessPage('pharmacist', path), false, path);
for (const role of ['admin', 'superadmin']) assert.equal(canAccessPage(role, '/dashboard'), true);
console.log('Page access checks passed: pharmacists restricted to four sections, including settings subpages.');
