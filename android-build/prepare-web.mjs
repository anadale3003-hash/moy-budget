import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const dest = new URL('./www/', import.meta.url);
await mkdir(dest, { recursive: true });
for (const name of ['icon.png','icon-512.png','icon.svg','manifest.webmanifest','version.json']) {
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
// Android updates are installed by the package manager, never by a PWA worker.
const version = JSON.parse(await readFile(new URL('./android-version.json', import.meta.url), 'utf8'));
assert(/^\d+\.\d+\.\d+$/.test(version.versionName), 'Invalid Android version');
const workerInstall = "if('serviceWorker' in navigator&&location.protocol.startsWith('http'))installProductionWorker().catch(()=>{});";
assert(html.includes(workerInstall), 'Expected PWA worker install call');
html = html.replace(workerInstall, '');
const updateStart = html.indexOf("$('checkUpdate').addEventListener('click',async()=>{");
const updateEnd = html.indexOf('/* Analytics modal interactions;', updateStart);
assert(updateStart >= 0 && updateEnd > updateStart, 'Expected PWA update handlers');
html = html.slice(0, updateStart) + "$('checkUpdate').addEventListener('click',()=>updateMessage('Обновления устанавливаются через RuStore.'));\n" + html.slice(updateEnd);
const updateCard = /<div class="card"><b>Обновления приложения<\/b>[\s\S]*?<button[^>]*id="applyUpdate"[^>]*>[\s\S]*?<\/button><\/div>/;
assert(updateCard.test(html), 'Expected update card');
html = html.replace(updateCard, '<div class="card"><b>Обновления приложения</b><p class="foot">Версия Android: '+version.versionName+'. Обновления устанавливаются через RuStore.</p><span id="appVersion" hidden></span><button class="btn full" id="checkUpdate" type="button">Как обновить приложение</button><div id="updateStatus" class="foot" role="status" aria-live="polite"></div><button id="applyUpdate" type="button" style="display:none" disabled></button></div>');
assert(!html.includes("fetch('./version.json?check=") && !html.includes(workerInstall), 'PWA updater remains');
assert(html.includes('<html lang="ru">') && html.includes('</body></html>'),'Expected HTML shell');
html=html.replace('<html lang="ru">','<html lang="ru" class="saldoza-android">').replace('</body></html>', "<style id=\"saldoza-android-layout\">\n/* The native WebView margins already account for Android system bars. */\nhtml.saldoza-android .app .main #v-plan.active>.design-group:has(.payment-inputs) .payment-receipt{\n display:grid!important;grid-template-rows:auto minmax(min-content,1fr) auto auto!important;\n aspect-ratio:auto!important;height:auto!important;min-height:170px!important;max-height:none!important;\n align-self:stretch!important;align-items:start!important;gap:8px!important;padding:11px!important;overflow:visible!important;\n}\nhtml.saldoza-android .app .main #v-plan.active .payment-receipt>.receipt-action-label{grid-row:1!important;margin:0!important}\nhtml.saldoza-android .app .main #v-plan.active .payment-receipt>.receipt-note{grid-row:2!important;min-width:0;height:auto!important;max-height:none!important;overflow:visible!important;white-space:normal!important}\nhtml.saldoza-android .app .main #v-plan.active .payment-receipt>.receipt-note strong{font-size:clamp(16px,5vw,24px)!important;line-height:1.2!important;overflow-wrap:anywhere}\nhtml.saldoza-android .app .main #v-plan.active .payment-receipt>.receipt-note span{font-size:12px!important;line-height:1.35!important;white-space:normal!important}\nhtml.saldoza-android .app .main #v-plan.active .payment-receipt>.receipt-button{grid-row:3!important;height:auto!important;min-height:44px!important;align-self:end!important;white-space:normal!important;line-height:1.15!important;margin:0!important;padding:7px 4px!important}\nhtml.saldoza-android .app .main #v-plan.active .payment-receipt>.receipt-undo{grid-row:4!important;margin:0!important}\nhtml.saldoza-android .app:has(#v-plan.active)>.main{overflow-y:auto!important}\nhtml.saldoza-android .app .main #v-plan.active{height:auto!important;max-height:none!important;overflow:visible!important}\nhtml.saldoza-android .app>.nav{padding-bottom:7px!important}\nhtml.saldoza-android.single-pay .app #v-plan.active .payment-inputs .payment-receipt:has(#advance){display:none!important}\n</style>"+'</body></html>');
await writeFile(new URL('index.html', dest), html);
console.log('Android assets staged; remote push removed. Local reminders not yet implemented.');
