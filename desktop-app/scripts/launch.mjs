import electron from 'electron';
import { root, run } from './common.mjs';
const env = { ...process.env };
// Editors built on Electron may export this switch to their child processes.
// The desktop executable must start Chromium, rather than Electron's Node mode.
delete env.ELECTRON_RUN_AS_NODE;
run(electron, [root, ...process.argv.slice(2)], { env });
