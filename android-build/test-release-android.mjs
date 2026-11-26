import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

const [candidate,previous]=process.argv.slice(2);
assert(candidate&&previous,'Pass candidate and previous APKs signed with the same test certificate');
const pkg='app.saldoza.budget';
const key='my-budget-v1';
const port=9222;
const adb=(...args)=>execFileSync('adb',args,{encoding:'utf8',timeout:45000}).trim();
async function retry(operation){
 let error;
 for(let i=0;i<30;i++){
  try{return await operation();}
  catch(e){error=e;await delay(1000);}
 }
 throw error;
}
async function webview(){
 const pid=await retry(()=>adb('shell','pidof',pkg));
 adb('forward','tcp:'+port,'localabstract:webview_devtools_remote_'+pid);
 const target=await retry(async()=>{
  const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(2000)})).json();
  const page=pages.find(page=>page.url.startsWith('https://localhost/'));
  assert(page,'Local WebView still starting');
  return page;
 });
 const socket=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{
  socket.addEventListener('open',resolve,{once:true});
  socket.addEventListener('error',reject,{once:true});
 });
 const pending=new Map();
 let sequence=0;
 socket.addEventListener('message',event=>{
  const response=JSON.parse(event.data);
  const call=pending.get(response.id);
  if(!call)return;
  clearTimeout(call.timer);
  pending.delete(response.id);
  if(response.error)call.reject(new Error(response.error.message));
  else call.resolve(response.result);
 });
 function send(method,params={}){
  return new Promise((resolve,reject)=>{
   const id=++sequence;
   const timer=setTimeout(()=>{pending.delete(id);reject(new Error(method+' timed out'));},15000);
   pending.set(id,{resolve,reject,timer});
   socket.send(JSON.stringify({id,method,params}));
  });
 }
 async function js(expression){
  const response=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});
  if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);
  return response.result.value;
 }
 await retry(async()=>assert(await js("document.querySelector('#v-home')?.classList.contains('active')")));
 return {js,close:()=>socket.close()};
}
function start(){
 adb('shell','am','start','-n',pkg+'/.MainActivity');
 return webview();
}
function getBudget(web){
 return web.js(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}))`);
}
async function waitWritable(web){
 await retry(async()=>assert.equal(await web.js("document.querySelector('#budgetLockDialog')?.open"),false));
}
function tapNode(match){
 const xmlPath='/sdcard/saldoza-ui.xml';
 adb('shell','uiautomator','dump',xmlPath);
 const xml=adb('shell','cat',xmlPath);
 const node=xml.match(/<node\b[^>]*>/g)?.find(match);
 assert(node,'Expected Android UI element was not shown');
 const bounds=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
 assert(bounds,'Element has no bounds');
 const [,x1,y1,x2,y2]=bounds.map(Number);
 adb('shell','input','tap',String((x1+x2)>>1),String((y1+y2)>>1));
}

let web;
try{
 adb('shell','input','keyevent','KEYCODE_WAKEUP');
 adb('shell','wm','dismiss-keyguard');
 adb('shell','cmd','connectivity','airplane-mode','enable');
 adb('shell','svc','wifi','disable');
 assert.equal(adb('shell','settings','get','global','airplane_mode_on'),'1');

 adb('install','-t',candidate);
 web=await start();
 await waitWritable(web);
 const launch=await web.js("({origin:location.origin, online:navigator.onLine, native:window.Capacitor.isNativePlatform(),backup:window.Capacitor.isPluginAvailable('BudgetBackup'),locks:!!navigator.locks})");
 assert.deepEqual(launch,{origin:'https://localhost',online:false,native:true,backup:true,locks:true});
 console.log('PASS installed APK cold start offline and registered native bridge');

 web.close();
 adb('shell','am','force-stop',pkg);
 adb('uninstall',pkg); // The emulator contains only test data.
 adb('install','-t',previous);
 web=await start();
 const today=await web.js("new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10)");
 const old=await getBudget(web);
 old.welcomeSeen=true;
 old.startBalances={date:today,balances:{family:5000,utilities:0,savings:0,other:0},mortgage:10};
 old.expenses.push({id:'upgrade-record',date:today,category:'family',type:'Продукты',amount:123.45});
 await web.js(`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify(old))});localStorage.setItem('saldoza-guide-stage','6');true`);
 web.close();

 adb('install','-r','-t',candidate);
 web=await start();
 await waitWritable(web);
 assert.equal((await getBudget(web)).expenses.find(row=>row.id==='upgrade-record')?.amount,123.45);
 console.log('PASS signed update from original APK preserves the stored ledger');

 await web.js("document.querySelector('#exportData').click(); true");
 await retry(()=>tapNode(node=>/resource-id="[^"]*:(?:id\/action_menu_save|id\/button1|id\/save)"/.test(node)||/text="(?:Save|SAVE|Сохранить)"/.test(node)));
 await retry(async()=>assert.equal(await web.js("document.querySelector('#budgetSaveLabel').textContent"),'Резервная копия сохранена'));
 const backupName='saldoza-backup-'+today+'.json';
 const path=await retry(()=>{
  const result=adb('shell','find','/sdcard/Download','/sdcard/Documents','/sdcard','-maxdepth','3','-name',backupName).split('\n').find(Boolean);
  assert(result,'Backup not found in Android shared storage');
  return result;
 });
 const exported=JSON.parse(adb('shell','cat',path));
 assert.equal(exported.version,1);
 assert.equal(exported.data.expenses.find(row=>row.id==='upgrade-record')?.amount,123.45);
 console.log('PASS Android document picker writes inspectable JSON to shared storage');

 // Change the ledger through the UI and use the real Android file picker to restore it.
 await web.js("document.querySelector('.tab[data-go=expense]').click();document.querySelector('[data-ops-action=expense]').click();document.querySelector('#smartOperationManual').click();document.querySelector('#expenseAmount').value='13';document.querySelector('#expenseCategory').value='family';document.querySelector('#expenseCategory').dispatchEvent(new Event('change'));document.querySelector('#expenseType').value='Продукты';document.querySelector('#expenseForm').requestSubmit();true");
 assert.ok((await getBudget(web)).expenses.some(row=>row.amount===13));
 await web.js("document.querySelector('#importClick').click(); true");
 await retry(()=>tapNode(node=>node.includes('text="'+backupName+'"')));
 await retry(()=>tapNode(node=>/resource-id="android:id\/button1"|text="(?:OK|ОК)"/.test(node)));
 await retry(async()=>assert.equal(await web.js("document.querySelector('#budgetSaveLabel').textContent"),'Данные восстановлены'));
 web.close();
 adb('shell','am','force-stop',pkg);
 web=await start();
 await waitWritable(web);
 assert.deepEqual((await getBudget(web)).expenses,exported.data.expenses);
 console.log('PASS Android file picker restores exported ledger across force-stop');

 adb('shell','pm','grant',pkg,'android.permission.POST_NOTIFICATIONS');
 await web.js("document.querySelector('#notifyReminderChoice').value='none';document.querySelector('#notifyTestBtn').click();true");
 await retry(async()=>assert.match(await web.js("document.querySelector('#notifyStatus').textContent"),/30 секунд/));
 await delay(38000);
 assert.match(adb('shell','dumpsys','notification'),/NotificationRecord\([^\n]*pkg=app\.saldoza\.budget/);
 console.log('PASS local test notification delivered in airplane mode with reminders off');
}finally{
 web?.close();
 try{adb('forward','--remove','tcp:'+port);}catch{}
}
