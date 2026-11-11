const assert = require('node:assert/strict');
const { test } = require('node:test');
const { deepLinkPath, isLocalUrl, readyMessage } = require('../electron/runtime.cjs');

test('only validated desktop reset links become local routes', () => {
  const token = 'A'.repeat(43);
  assert.equal(deepLinkPath(`pharma-erp://reset-password?token=${token}`), `/reset-password?token=${token}`);
  for (const url of ['https://evil.test/reset-password?token=' + token, 'pharma-erp://other?token=' + token,
    'pharma-erp://reset-password?token=short', 'pharma-erp://reset-password/extra?token=' + token,
    'pharma-erp://reset-password?token=%22%3Cscript%3E', 'invalid']) assert.equal(deepLinkPath(url), null);
});

test('local access is limited to the selected backend origin', () => {
  const origin = 'http://127.0.0.1:43210';
  assert.ok(isLocalUrl(origin + '/api/v1/sales', origin));
  for (const url of ['http://127.0.0.1:43211/', 'https://127.0.0.1:43210/',
    'http://127.0.0.1.evil.test:43210/', 'file:///etc/passwd', 'http://evil.test/']) assert.equal(isLocalUrl(url, origin), false);
});

test('backend startup accepts only a complete validated readiness signal', () => {
  const ready = { event: 'ready', port: 12345, setup_required: true };
  assert.deepEqual(readyMessage(JSON.stringify(ready)), ready);
  for (const line of ['log text', '{}', JSON.stringify({ ...ready, port: 0 }),
    JSON.stringify({ ...ready, port: 999999 }), JSON.stringify({ ...ready, setup_required: undefined })]) assert.equal(readyMessage(line), null);
});
