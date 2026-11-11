const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function until(window, expression, label) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Desktop smoke test timed out: ${label}`);
}

async function run({ app, window, backend, launchBackend, getBackend, project }) {
  const output = process.env.ERP_DESKTOP_SMOKE_OUTPUT || (app.isPackaged ? path.join(os.tmpdir(), 'pharma-desktop-validation') : path.join(project, 'test-output'));
  fs.mkdirSync(output, { recursive: true });
  const capture = async name => {
    await window.webContents.executeJavaScript(`document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))`);
    fs.writeFileSync(path.join(output, name + '.png'), (await window.capturePage()).toPNG());
  };
  await until(window, `document.querySelector('#setup-email') !== null`, 'initial setup');
  await capture('01-first-run');
  const credentials = { first_name: 'Desktop', last_name: 'Owner', email: 'desktop-test@example.com',
    pharmacy_name: 'Desktop Test Pharmacy', license_number: 'DESKTOP-TEST',
    password: 'DesktopSmokePassword123!', confirm_password: 'DesktopSmokePassword123!' };
  await window.webContents.executeJavaScript(`(() => {
    const values = ${JSON.stringify(credentials)};
    for (const [name, value] of Object.entries(values)) document.querySelector('#setup-' + name).value = value;
    document.querySelector('form').requestSubmit();
  })()`);
  await until(window, `document.querySelector('#login-email') !== null`, 'unchanged login screen');
  await capture('02-login');
  const login = async () => {
    await window.webContents.executeJavaScript(`(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      for (const [id, value] of [['login-email', ${JSON.stringify(credentials.email)}], ['login-password', ${JSON.stringify(credentials.password)}]]) {
        const input = document.getElementById(id); setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await new Promise(requestAnimationFrame); document.querySelector('form').requestSubmit();
    })()`);
    await until(window, `document.querySelector('.navbar-top') !== null && location.pathname === '/dashboard'`, 'login and dashboard');
  };
  await login();
  await until(window, `document.querySelector('.dashboard-update')?.textContent.includes('Updated ')`, 'dashboard data');
  await capture('03-dashboard');
  assert.equal(await window.webContents.executeJavaScript(`typeof window.require`), 'undefined');
  const image = await window.webContents.executeJavaScript(`fetch('/assets/login-showcase.jpg').then(response => response.status)`);
  assert.equal(image, 200);
  assert.equal((await fetch(backend.origin + '/desktop/status')).status, 403);
  let auth = await backend.request('/api/v1/auth/login', { method: 'POST', body: { email: credentials.email, password: credentials.password } });
  const medicine = await backend.request('/api/v1/medicines', { method: 'POST', bearer: auth.access_token,
    body: { name: 'Desktop Medicine', sku: 'DESKTOP-1', batch_number: 'LOCAL-B1', expiry_date: '2035-12-31', purchase_price: '5.00', selling_price: '10.00', stock_quantity: 20 } });
  const checkout = { request_id: randomUUID(), patient_name: 'Desktop Patient', customer_mobile: '9876543210',
    items: [{ medicine_id: medicine.id, quantity: 2 }], payment: { method: 'cash', tendered: '20', confirmed: true } };
  await backend.request('/api/v1/sales/checkout', { method: 'POST', bearer: auth.access_token, body: checkout });
  const pages = ['/medicines', '/stock-management', '/suppliers', '/orders', '/purchase-orders', '/expiry-alerts', '/users', '/settings/company', '/settings/import'];
  for (const route of pages) {
    await window.loadURL(backend.origin + route);
    await until(window, `document.querySelector('.navbar-top') !== null && document.querySelector('main h1') !== null`, route);
  }
  await until(window, `document.querySelector('#import-file') !== null`, 'migration importer');
  await window.webContents.executeJavaScript(`(() => {
    const transfer = new DataTransfer(); transfer.items.add(new File(['name\\nDesktop Imported Supplier\\n'], 'desktop-suppliers.csv', { type: 'text/csv' }));
    const input = document.getElementById('import-file'); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await window.webContents.executeJavaScript(`document.querySelector('.data-import form').requestSubmit()`);
  await until(window, `document.querySelector('.import-review .primary-button') !== null`, 'CSV preview');
  await capture('04-import-preview');
  await window.webContents.executeJavaScript(`document.querySelector('.import-review .primary-button').click()`);
  await until(window, `document.querySelector('.data-import')?.textContent.includes('Imported 1 records successfully')`, 'CSV commit');
  const backup = await backend.request('/desktop/control/backup', { method: 'POST', control: true });
  assert.ok(fs.existsSync(backup.path));
  await backend.stop();
  await launchBackend();
  backend = getBackend();
  assert.equal(backend.setupRequired, false);
  auth = await backend.request('/api/v1/auth/login', { method: 'POST', body: { email: credentials.email, password: credentials.password } });
  const saved = await backend.request('/api/v1/medicines', { bearer: auth.access_token });
  assert.equal(saved[0].stock_quantity, 18);
  assert.equal((await backend.request('/api/v1/sales', { bearer: auth.access_token })).length, 1);
  assert.equal((await backend.request('/api/v1/suppliers', { bearer: auth.access_token })).length, 1);
  await window.loadURL(backend.origin + '/login');
  await until(window, `document.querySelector('#login-email') !== null`, 'login after restart');
  await login();
  await until(window, `document.querySelector('.dashboard-update')?.textContent.includes('Updated ')`, 'persistent dashboard data');
  await capture('05-persistent-dashboard');
  fs.writeFileSync(path.join(output, 'smoke-result.json'), JSON.stringify({ passed: true,
    checks: ['first-run UI', 'login UI', 'superadmin dashboard', 'renderer isolation', 'bundled login image',
      'loopback API guard', 'billing and stock ledger', ...pages, 'CSV preview and commit', 'database backup', 'persistence after backend restart'],
    platform: process.platform, architecture: process.arch, version: app.getVersion() }, null, 2) + '\n');
  process.stdout.write(`Desktop smoke test passed. Screenshots and report: ${output}\n`);
  app.quit();
}

module.exports = { run };
