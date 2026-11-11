import path from 'node:path';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { root, run } from './common.mjs';
const target = process.argv[2];
const required = target === 'mac' ? 'darwin' : target === 'win' ? 'win32' : null;
if (!required || process.platform !== required) throw new Error(`Build ${target} installers on ${required || 'a supported platform'} using the included native build workflow.`);
if (!existsSync(path.join(root, 'resources/icon.png'))) {
  const require = createRequire(import.meta.url);
  const iconEnv = { ...process.env };
  delete iconEnv.ELECTRON_RUN_AS_NODE;
  run(require('electron'), ['scripts/render-icon.cjs'], { env: iconEnv });
}
run(process.execPath, ['scripts/build.mjs']);
run(process.execPath, [path.join(root, 'node_modules/electron-builder/cli.js'), '--' + target, '--' + process.arch, '--publish', 'never'], {
  env: { ...process.env, ELECTRON_BUILDER_CACHE: path.join(root, '.cache/electron-builder') },
});
run(process.execPath, ['scripts/checksums.mjs']);
