import { mkdir, copyFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const dest = new URL('./www/', import.meta.url);
await mkdir(dest, { recursive: true });
for (const name of ['index.html','icon.png','icon-512.png','icon.svg','manifest.webmanifest','sw.js','version.json']) {
  await copyFile(new URL(name, root), new URL(name, dest));
}
console.log('Web assets staged; offline behavior still requires device tests.');
