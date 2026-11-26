import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const version = JSON.parse(await readFile(new URL('./android-version.json', import.meta.url), 'utf8'));
assert(typeof version.versionName === 'string' && /^\d+\.\d+\.\d+$/.test(version.versionName), 'Invalid versionName');
assert(Number.isInteger(version.versionCode) && version.versionCode > 0 && version.versionCode <= 2100000000, 'Invalid versionCode');
const file = new URL('./android/app/build.gradle', import.meta.url);
let gradle = await readFile(file, 'utf8');
for (const [pattern, replacement] of [
  [/^\s*versionCode\s+\d+\s*$/gm, '        versionCode ' + version.versionCode],
  [/^\s*versionName\s+["'][^"'\r\n]+["']\s*$/gm, '        versionName "' + version.versionName + '"']
]) {
  assert([...gradle.matchAll(pattern)].length === 1, 'Unexpected Gradle version declaration');
  gradle = gradle.replace(pattern, replacement);
}
await writeFile(file, gradle);
console.log('Android version:', version.versionName, version.versionCode);
