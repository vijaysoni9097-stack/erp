const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Backend } = require('../electron/runtime.cjs');

test('bundled backend works without the development Python and persists its local data', { timeout: 60000 }, async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pharma-frozen-test-'));
  const log = fs.createWriteStream(path.join(temporary, 'backend.log'));
  const project = path.resolve(__dirname, '..');
  let backend;
  const start = async () => {
    backend = new Backend({ project, packaged: false, development: false, dataDir: path.join(temporary, 'data'), log });
    await backend.start();
  };
  try {
    await start();
    assert.equal(backend.setupRequired, true);
    const password = 'FrozenTestPassword123!';
    await backend.request('/desktop/setup', { method: 'POST', body: { first_name: 'Frozen', last_name: 'Owner',
      email: 'frozen@example.com', pharmacy_name: 'Frozen Test', license_number: 'FROZEN-TEST', password, confirm_password: password } });
    let login = await backend.request('/api/v1/auth/login', { method: 'POST', body: { email: 'frozen@example.com', password } });
    assert.equal(login.profile.role, 'superadmin');
    await backend.request('/api/v1/suppliers', { method: 'POST', bearer: login.access_token, body: { name: 'Frozen Supplier' } });
    const backup = await backend.request('/desktop/control/backup', { method: 'POST', control: true });
    assert.ok(fs.existsSync(backup.path));
    await backend.stop();
    await start();
    assert.equal(backend.setupRequired, false);
    login = await backend.request('/api/v1/auth/login', { method: 'POST', body: { email: 'frozen@example.com', password } });
    assert.equal((await backend.request('/api/v1/suppliers', { bearer: login.access_token }))[0].name, 'Frozen Supplier');
  } finally {
    await backend?.stop();
    await new Promise(resolve => log.end(resolve));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
