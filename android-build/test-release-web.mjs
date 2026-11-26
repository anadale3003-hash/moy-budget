import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const key='my-budget-v1';
const firstDay='2026-11-26';
const payday='2026-12-01';
const fixture=(overrides={})=>({
 welcomeSeen:true,showCreditTab:true,payFrequency:'once',payDays:{advance:16,salary:1},
 months:{},weights:{family:50,utilities:7.5,savings:7.5,other:7.5},
 debt:0,reserved:0,mortgageMonthly:0,ladder:{reserve:0,included:false},
 expenses:[],expenseTypes:{family:['Продукты']},salaryConfig:{base:100000,mode:'net',taxRate:13},
 startBalances:{date:'2026-11-01',balances:{family:5000}},...overrides
});
const clock=date=>new Date(date+'T12:00:00+03:00');
const browser=await chromium.launch({executablePath:process.env.SALDOZA_CHROMIUM||undefined,args:['--no-sandbox']});

async function context(initial){
 const session=await browser.newContext({locale:'ru-RU',timezoneId:'Europe/Moscow',viewport:{width:360,height:800}});
 await session.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!=='https://localhost')return route.abort();
  const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
  try{
   const body=await readFile(new URL('./www/'+name,import.meta.url));
   await route.fulfill({body,contentType:name.endsWith('.html')?'text/html; charset=utf-8':undefined});
  }catch {await route.abort();}
 });
 if(initial)await session.addInitScript(({key,initial})=>{
  if(location.origin!=='https://localhost')return;
  if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(initial));
  localStorage.setItem('saldoza-guide-stage','6');
 },{key,initial});
 return session;
}
const budget=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
async function open(session,date=firstDay,locked=false){
 const page=await session.newPage();
 await page.clock.setFixedTime(clock(date));
 await page.goto('https://localhost/');
 await page.locator('#budgetLockDialog').waitFor({state:locked?'visible':'hidden'});
 return page;
}
async function expense(page,amount){
 await page.locator('.tab[data-go=expense]').click();
 await page.locator('[data-ops-action=expense]').click();
 await page.locator('#smartOperationManual').click();
 await page.locator('#expenseAmount').fill(String(amount));
 await page.locator('#expenseDate').fill(firstDay);
 await page.locator('#expenseCategory').selectOption('family');
 await page.locator('#expenseType').selectOption('Продукты');
 await page.locator('#expenseForm button[type=submit]').click();
}
async function restore(page,data,version=1){
 let dialog;
 page.once('dialog',async event=>{
  dialog=event.type();
  await event.accept();
 });
 await page.locator('#importData').setInputFiles({
  name:'saldoza-test.json',mimeType:'application/json',
  buffer:Buffer.from(typeof data==='string'?data:JSON.stringify({version,data}))
 });
 await page.waitForFunction(()=>document.querySelector('#importData').value==='');
 return dialog;
}
const bill=(cents=500000,firstDue=payday)=>({id:'test-bill',name:'Платёж',category:'family',cents,firstDue});

try{
 let session=await context(fixture());
 let page=await open(session);
 const waiting=await open(session,firstDay,true);
 await expense(page,11);
 assert.deepEqual((await budget(waiting)).expenses.map(row=>row.amount),[11]);
 assert.match(await waiting.locator('#budgetLockDialog').textContent(),/в другом окне/);
 await page.close();
 await waiting.locator('#budgetLockDialog').waitFor({state:'hidden'});
 await expense(waiting,22);
 await waiting.reload();
 await waiting.locator('#budgetLockDialog').waitFor({state:'hidden'});
 assert.deepEqual((await budget(waiting)).expenses.map(row=>row.amount),[11,22]);
 await session.close();
 console.log('PASS exclusive editing, automatic handover and durable writes');

 session=await context(fixture({monthlyBills:[bill(600000)]}));
 page=await open(session);
 assert.match(await page.locator('#dailySpendingLimit').textContent(),/0,00/);
 assert.match(await page.locator('#dailySpendingNote').textContent(),/Не хватает.*1\s000,00/);
 await page.close();
 page=await open(session,payday);
 assert.match(await page.locator('#dailySpendingNote').textContent(),/До зачисления доступно на покупки 0,00/);
 await page.locator('.tab[data-go=plan]').click();
 await page.locator('#receiveSalary').click();
 await page.locator('#receiptEntryAmount').fill('100000');
 await page.locator('#receiptEntryForm button[type=submit]').click();
 assert.ok((await budget(page)).receipts.some(receipt=>receipt.amount===100000));
 await page.locator('.tab[data-go=home]').click();
 assert.doesNotMatch(await page.locator('#dailySpendingNote').textContent(),/До зачисления/);
 await session.close();
 console.log('PASS payday obligations before receipt, cash deficit and actual salary');

 session=await context(fixture({mortgageMonthly:120000}));
 page=await open(session);
 await page.locator('.tab[data-go=plan]').click();
 assert.match(await page.locator('#planWarnings').textContent(),/На ипотеку не хватает 20\s000,00/);
 assert.match(await page.locator('#planTable tbody tr').last().textContent(),/100\s000,00/);
 await session.close();
 console.log('PASS mortgage deficit visible without over-allocating income');

 session=await context();
 page=await open(session);
 await page.waitForFunction(key=>localStorage.getItem(key),key);
 let current=await budget(page);
 assert.equal(current.categoryRules.utilities.value,0);
 assert.equal(current.ladder.reserve,0);
 assert.equal(current.months['2026-11'].mortgage,0);
 assert.equal(current.expenses.length,0);
 await session.close();

 session=await context(fixture());
 page=await open(session);
 const legacy=fixture({payDays:{advance:15,salary:30}});
 delete legacy.mortgageMonthly;
 delete legacy.ladder;
 assert.equal(await restore(page,legacy),'confirm');
 current=await budget(page);
 assert.equal(current.categoryRules.utilities.value,0);
 assert.equal(current.ladder.reserve,0);
 assert.equal(current.months['2026-11'].mortgage,0);
 assert.deepEqual(current.payDays,{advance:15,salary:30});

 const valid=fixture({mortgageMonthly:55000,ladder:{reserve:150000,included:true},
  startBalances:{date:'2026-11-01',balances:{family:5000},mortgage:5000}});
 assert.equal(await restore(page,valid),'confirm');
 const baseline=await budget(page);
 assert.equal(baseline.mortgageMonthly,55000);
 assert.equal(baseline.ladder.reserve,150000);
 await page.locator('.tab[data-go=card]').click();
 await page.locator('.payment-confirm').filter({has:page.locator('#confirmMortgagePayment')}).locator('.credit-wide-button').click();
 await page.locator('#paymentEntryAmount').fill('400');
 await page.locator('#paymentEntryForm button[type=submit]').click();
 await page.reload();
 await page.locator('#budgetLockDialog').waitFor({state:'hidden'});
 assert.deepEqual((await budget(page)).regularPayments.map(row=>row.amount),[400]);
 await page.locator('.tab[data-go=settings]').click();
 await page.locator('details').filter({has:page.locator('#exportData')}).locator('summary').first().click();
 const download=page.waitForEvent('download');
 await page.locator('#exportData').click();
 const exported=await readFile(await (await download).path(),'utf8');
 assert.equal(await restore(page,exported),'confirm');
 const beforeInvalid=await budget(page);
 for(const bad of [
  fixture({startBalances:{date:'2026-11-01',balances:{family:-100}}}),
  fixture({startBalances:{date:'2026-11-01',balances:{family:true}}}),
  fixture({receipts:[{id:'a',date:firstDay,month:'2026-11',amount:11,type:'salary',amounts:{family:-11}}]}),
  fixture({expenses:[1,2].map(amount=>({id:'dupe',date:firstDay,amount,category:'family'}))}),
  fixture({confirmedSavings:{base:0,entries:['bad']}}),
  '{"version":1,"data":{"__proto__":{}}}'
 ]){
  assert.equal(await restore(page,bad),'alert');
  assert.deepEqual(await budget(page),beforeInvalid);
 }
 assert.equal(await restore(page,valid,999),'alert');
 assert.deepEqual(await budget(page),beforeInvalid);
 await session.close();
 console.log('PASS clean and legacy defaults, mortgage reload, backup round-trip and rejection');
}finally{
 await browser.close();
}
