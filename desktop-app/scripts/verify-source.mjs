import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { root } from './common.mjs';
const parent = path.dirname(root);
if (!existsSync(path.join(parent, 'frontend/src/App.jsx'))) {
  console.log('Standalone desktop snapshot; parent web source is not present.');
} else {
  function check(relative) {
    for (const item of readdirSync(path.join(parent, relative), { withFileTypes: true })) {
      if (['__pycache__', '.DS_Store'].includes(item.name)) continue;
      const file = path.join(relative, item.name);
      if (item.isDirectory()) { check(file); continue; }
      let original = readFileSync(path.join(parent, file));
      if (file.replaceAll('\\', '/') === 'frontend/src/styles/Login.css') {
        original = Buffer.from(original.toString().replace(/url\('(https:\/\/images\.unsplash\.com\/[^']+)'\)/, "url('/assets/login-showcase.jpg')"));
      }
      if (!original.equals(readFileSync(path.join(root, file)))) throw new Error(`Desktop source differs from web: ${file}`);
    }
  }
  check('frontend/src'); check('backend/app');
  console.log('All app screens and business logic match the web source. Only the login image URL is localized.');
}
