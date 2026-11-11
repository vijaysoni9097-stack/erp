import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} exited with status ${result.status}`);
}

export function requirePython() {
  if (!existsSync(python)) throw new Error('Run npm run setup first to create the desktop Python environment.');
  return python;
}

export function npm(args, options = {}) {
  // Run npm's JS entry point using the same supported Node runtime, including on Windows.
  if (process.env.npm_execpath) return run(process.execPath, [process.env.npm_execpath, ...args], options);
  return run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { shell: process.platform === 'win32', ...options });
}
