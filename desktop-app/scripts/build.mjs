import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { root, requirePython, run, npm } from './common.mjs';

if (!existsSync(path.join(root, 'frontend/public/assets/login-showcase.jpg'))) throw new Error('Run npm run setup to bundle the login photograph.');
npm(['run', 'build', '--prefix', 'frontend']);
const guide = readFileSync(path.join(root, 'README.md'), 'utf8').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
writeFileSync(path.join(root, 'build/desktop-guide.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><title>PHARMA ERP Desktop Guide</title><style>body{font:15px/1.6 system-ui,sans-serif;max-width:1000px;margin:40px auto;padding:0 24px;color:#1d2738}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>PHARMA ERP Desktop Guide</h1><pre>' + guide + '</pre></html>');
for (const filename of readdirSync(path.join(root, 'build/ui/assets'))) {
  if (/\.(js|css)$/.test(filename)) {
    const content = readFileSync(path.join(root, 'build/ui/assets', filename), 'utf8');
    if (content.includes('pharmacy-erp-testing-api.onrender.com') || content.includes('images.unsplash.com')) {
      throw new Error('Desktop assets still reference a hosted service. Build refused.');
    }
  }
}
if (!process.argv.includes('--ui-only')) {
  const architecture = execFileSync(requirePython(), ['-c', 'import platform; print(platform.machine())'], { encoding: 'utf8' }).trim().toLowerCase();
  const pythonArch = ['arm64', 'aarch64'].includes(architecture) ? 'arm64' : ['x86_64', 'amd64'].includes(architecture) ? 'x64' : architecture;
  if (pythonArch !== process.arch) throw new Error(`Python architecture ${pythonArch} must match Node/Electron ${process.arch}. Recreate .venv with a matching Python.`);
  mkdirSync(path.join(root, 'build/pyinstaller'), { recursive: true });
  run(requirePython(), ['-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir',
    '--name', 'pharma-erp-api', '--distpath', 'build/backend', '--workpath', 'build/pyinstaller',
    '--specpath', 'build', '--paths', 'backend', '--collect-submodules', 'app',
    '--collect-submodules', 'uvicorn', '--hidden-import', 'sqlalchemy.dialects.sqlite', '--exclude-module', 'psycopg',
    'backend/entry.py'], { env: { ...process.env, PYINSTALLER_CONFIG_DIR: path.join(root, '.cache/pyinstaller') } });
  writeFileSync(path.join(root, 'build/backend/manifest.json'), JSON.stringify({ platform: process.platform, architecture: process.arch }, null, 2) + '\n');
}
