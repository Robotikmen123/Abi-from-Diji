import { readdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

// Kok package.json "type": "module" oldugu icin Electron ana sureci .cjs olmali.
// tsc CommonJS ciktisini .js olarak yaziyor; uzantiyi burada duzeltiyoruz.
const dist = path.join(import.meta.dirname, '..', 'dist');

for (const file of await readdir(dist)) {
  if (file.endsWith('.js.bak')) {
    await unlink(path.join(dist, file));
    continue;
  }
  if (!file.endsWith('.js')) continue;
  const from = path.join(dist, file);
  await rename(from, path.join(dist, `${file.slice(0, -3)}.cjs`));
}
