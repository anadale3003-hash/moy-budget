const assert=require('node:assert/strict'), launch=require('./serve.cjs');
(async()=>{const {b,url,close}=await launch();try{
for(const [width,height,file] of [[320,690,'preview.html'],[390,844,'index.html'],[1100,800,'preview.html']]){
 const ctx=await b.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500,timezoneId:'Europe/Moscow',userAgent:width<500?'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Mobile Safari':'Chromium'});
 const p=await ctx.newPage(),errors=[];p.setDefaultTimeout(4500);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.clock.setFixedTime(new Date('2026-11-25T10:00:00+03:00'));
 await p.goto(url+'/'+file);const $=s=>p.locator(s),click=s=>$(s).click(),fill=(s,v)=>$(s).fill(v);
 const data=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('saldoza-test-budget-v1')));
 await click('#firstBudget');await fill('#start-family','15000');await click('#saveStart');assert.equal(await $('#v-home').evaluate(e=>e.classList.contains('active')),true);
 await click('#purchaseCheckOpen');await fill('#purchaseName','Ботинки');await fill('#purchasePrice','4000');await fill('#purchaseDaily','1500');
 await click('#planAfterPayday');assert.equal(await $('#calendarPurchaseName').inputValue(),'Ботинки');assert.equal(await $('#calendarPurchaseAmount').inputValue(),'4000');assert.equal(await $('#calendarPurchaseDate').inputValue(),'2026-12-02');
 await click('#calendarPurchaseForm button[type=submit]');assert.equal((await data()).expenses.length,0);
 await click('#scenarioPanel summary');await fill('#scenarioDaily','500');await fill('#scenarioDelay','2');assert.match(await $('#scenarioResult').innerText(),/по сценарию/);assert.equal((await data()).expenses.length,0);
 await $('#calendarPurchaseList').getByRole('button',{name:'Записать расход'}).click();assert.equal((await data()).expenses.length,1);assert.equal((await data()).calendarPurchases.length,0);
 await click('#incomeSchedulePanel summary');await fill('#incomeScheduleName','Подработка');await fill('#incomeScheduleDate','2026-11-25');await fill('#incomeScheduleAmount','3500');await click('#incomeScheduleForm button');
 assert.equal((await data()).extraIncomes.length,0);await $('#incomeScheduleList').getByRole('button',{name:/Получено/}).click();assert.equal((await data()).extraIncomes.length,1);assert.equal(await $('#incomeScheduleList button').count(),1);
 await click('#moneyCalendarClose');
 for(const tab of ['home','plan','card','expense','analytics','settings']){
   await click('button.tab[data-go="'+tab+'"]');assert.equal(await $('button.tab[aria-current=page]').count(),1);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0,tab+' at width '+width);
 }
 await click('button.tab[data-go="expense"]');
 for(let i=0;i<2;i++){await click('[data-ops-action="expense"]');if(width<500)assert.ok(await $('#smartVoiceButton').isHidden());await fill('#smartOperationText','продукты 500');await click('#smartOperationForm button[type=submit]');assert.ok(await $('#smartOperationContinue').isEnabled());await click('#smartOperationClose')}
 await p.reload();assert.equal((await data()).expenses.length,1);assert.deepEqual(errors,[]);
 console.log('PASS',width,file);await ctx.close();
}
}finally{await close()}})().catch(e=>{console.error(e);process.exitCode=1});
