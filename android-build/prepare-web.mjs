import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const dest = new URL('./www/', import.meta.url);
await mkdir(dest, { recursive: true });
for (const name of ['icon.png','icon-512.png','icon.svg','manifest.webmanifest','sw.js','version.json']) {
  await copyFile(new URL(name, root), new URL(name, dest));
}
let html = await readFile(new URL('index.html', root), 'utf8');
const marker = '<script>\n/* Remote Web Push integration for the installed PWA. */';
const start = html.indexOf(marker);
assert(start >= 0 && html.indexOf(marker, start + 1) === -1, 'Expected exactly one remote push block');
const end = html.indexOf('</script>', start);
assert(end > start, 'Remote push block must terminate');
html = html.slice(0, start) + html.slice(end + '</script>'.length);
const card = /(<div class="card" id="notifySettingsCard">)[\s\S]*?(?=<div class="card theme-card">)/;
assert(card.test(html), 'Notification settings card missing');
html = html.replace(card, '$1<b>Напоминания</b><p class="foot">В этой Android-сборке уведомления пока недоступны.</p><select id="notifyReminderChoice" hidden><option value="all">Все</option><option value="pay">Выплаты</option><option value="none" selected>Выключены</option></select><button id="notifyEnableBtn" type="button" hidden disabled></button></div>\n');
html = html.replace("if(stage===4&&source.value!=='none')q('notifyEnableBtn').click();", "if(stage===4){source.value='none';}");
assert(!html.includes('workers.dev') && !html.includes("post('/subscribe'") && !html.includes('pushManager.subscribe('), 'Remote push code remains');
await writeFile(new URL('index.html', dest), html);
console.log('Android assets staged; remote push removed. Local reminders not yet implemented.');
