import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const src = resolve(root, 'src/extension.js');
const out = resolve(root, 'dist/extension.js');

const check = spawnSync(process.execPath, ['--check', src], { stdio: 'inherit' });
if (check.status !== 0) {
  process.exit(check.status ?? 1);
}

mkdirSync(dirname(out), { recursive: true });
copyFileSync(src, out);
console.log(`Built ${out}`);
