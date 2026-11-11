import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root } from './common.mjs';

const repository = path.dirname(root);
if (!existsSync(path.join(repository, 'frontend/src/App.jsx'))) {
  throw new Error('sync:web requires the parent ERP repository; the desktop snapshot builds independently without this command.');
}
for (const folder of ['frontend/src', 'frontend/public', 'frontend/scripts', 'backend/app', 'backend/tests']) {
  const target = path.join(root, folder);
  rmSync(target, { recursive: true, force: true });
  cpSync(path.join(repository, folder), target, {
    recursive: true,
    filter: source => !['__pycache__', '.DS_Store'].includes(path.basename(source)),
  });
}
for (const file of ['frontend/index.html', 'frontend/package.json', 'frontend/package-lock.json', 'backend/requirements.txt']) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  cpSync(path.join(repository, file), path.join(root, file));
}
// The same photograph is bundled locally, preserving the login appearance offline.
const loginCss = path.join(root, 'frontend/src/styles/Login.css');
const original = readFileSync(loginCss, 'utf8');
const remoteImage = original.match(/url\('(https:\/\/images\.unsplash\.com\/[^']+)'\)/)?.[1];
if (!remoteImage) throw new Error('Login background changed; update the desktop asset mapping before syncing.');
mkdirSync(path.join(root, 'resources'), { recursive: true });
writeFileSync(path.join(root, 'resources/login-image-url.txt'), remoteImage + '\n');
writeFileSync(loginCss, original.replace(remoteImage, '/assets/login-showcase.jpg'));
writeFileSync(path.join(root, 'resources/web-snapshot.json'), JSON.stringify({
  syncedAt: new Date().toISOString(),
  source: '../frontend and ../backend',
  changes: ['API uses same-origin /api/v1 at build time', 'Login background image is bundled locally'],
}, null, 2) + '\n');
console.log('Copied application source and tests only. No environment files, credentials, databases or dependencies were copied.');
