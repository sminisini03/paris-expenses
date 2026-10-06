// Bump the app version everywhere it lives, so phones pick up the update:
//   node tools/release.mjs 0.9.0
// - sw.js VERSION      → new service-worker cache (offline copy is replaced)
// - js/app.js          → version shown in Settings
// - index.html ?v=…    → stylesheet URLs change, so no stale CSS from memory caches
import { readFileSync, writeFileSync } from 'node:fs';

const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v ?? '')) {
  console.error('Usage: node tools/release.mjs <major.minor.patch>');
  process.exit(1);
}
const edits = [
  ['sw.js', /const VERSION = 'v[\d.]+';/, `const VERSION = 'v${v}';`],
  ['js/app.js', /export const APP_VERSION = '[\d.]+';/, `export const APP_VERSION = '${v}';`],
  ['index.html', /\.css(\?v=[\d.]+)?"/g, `.css?v=${v}"`],
];
for (const [file, re, to] of edits) {
  const before = readFileSync(file, 'utf8');
  const after = before.replace(re, to);
  if (after === before && !before.includes(to)) throw new Error(`Nothing to update in ${file}`);
  writeFileSync(file, after);
  console.log(`${file} → ${v}`);
}
