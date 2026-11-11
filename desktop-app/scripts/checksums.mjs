import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root } from './common.mjs';
const folder = path.join(root, 'release');
const lines = readdirSync(folder).filter(file => /\.(dmg|zip|exe)$/.test(file)).sort()
  .map(file => `${createHash('sha256').update(readFileSync(path.join(folder, file))).digest('hex')}  ${file}`);
writeFileSync(path.join(folder, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
console.log('Installer checksums saved to release/SHA256SUMS.txt');
