import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root, python, run, npm } from './common.mjs';

if (Number(process.versions.node.split('.')[0]) !== 22 || Number(process.versions.node.split('.')[1]) < 12) {
  throw new Error('Use Node 22.12+ within major version 22.');
}
if (!existsSync(python)) {
  if (process.env.ERP_DESKTOP_PYTHON) run(process.env.ERP_DESKTOP_PYTHON, ['-m', 'venv', '.venv']);
  else if (process.platform === 'win32') run('py', ['-3.11', '-m', 'venv', '.venv']);
  else run('python3', ['-m', 'venv', '.venv']);
}
run(python, ['-m', 'pip', 'install', '-r', 'backend/requirements-test.txt']);
npm(['ci', '--prefix', 'frontend']);
run(process.execPath, ['node_modules/electron/install.js'], { env: {
  ...process.env, ELECTRON_CACHE: path.join(root, '.cache/electron'), electron_config_cache: path.join(root, '.cache/electron'),
} });
const image = path.join(root, 'frontend/public/assets/login-showcase.jpg');
if (!existsSync(image)) {
  const response = await fetch(readFileSync(path.join(root, 'resources/login-image-url.txt'), 'utf8').trim());
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('Could not download the original login image. Retry setup with internet access.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1000) throw new Error('The login image download is incomplete.');
  mkdirSync(path.dirname(image), { recursive: true });
  writeFileSync(image, bytes);
}
console.log('Desktop dependencies ready. Run npm run dev, npm run dist:mac, or npm run dist:win.');
