import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const directory = path.dirname(fileURLToPath(import.meta.url));
const tests = readdirSync(directory).filter(name => /^test_.*\.mjs$/.test(name)).sort();
for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(directory, test)], { stdio: 'inherit', cwd: path.dirname(directory) });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`${tests.length} frontend test scripts passed.`);
