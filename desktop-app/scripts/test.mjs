import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { root, requirePython, run, npm } from './common.mjs';

const temporary = mkdtempSync(path.join(os.tmpdir(), 'pharma-desktop-tests-'));
const env = { ...process.env, DATABASE_URL: `sqlite:///${path.join(temporary, 'tests.db')}`,
  REQUIRE_POSTGRES: 'false', DEBUG: 'false', PYTHONDONTWRITEBYTECODE: '1',
  PYTHONPATH: [path.join(root, 'backend'), path.join(root, 'backend/tests')].join(path.delimiter) };
try {
  run(process.execPath, ['--test', 'tests/runtime.test.cjs']);
  run(requirePython(), ['-m', 'unittest', 'discover', '-s', path.join(root, 'tests'), '-p', 'test_*.py'], { cwd: temporary, env });
  run(requirePython(), ['-m', 'unittest', 'discover', '-s', path.join(root, 'backend/tests')], { cwd: temporary, env });
  npm(['test', '--prefix', 'frontend']);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
