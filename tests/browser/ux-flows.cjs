const assert=require('node:assert/strict'), launch=require('./serve.cjs');
(async()=>{const {b,url,close}=await launch();try{
for(const [width,height,file] of [[320,690,'preview.html'],[390,844,'index.html'],[1100,800,'preview.html']]){
 const ctx=await b.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500,timezoneId:'Europe/Moscow',userAgent:width<500?'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Mobile Safari':'Chromium'});
 const p=await ctx.newPage(),errors=[];p.setDefaultTimeout(4500);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.clock.setFixedTime(new Date('2026-11-25T10:00:00+03:00'));
 await p.goto(url+'/'+file);const $=s=>p.locator(s),click=s=>$(s).click(),fill=(s,v)=>$(s).fill(v);
 const data=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('saldoza-test-budget-v1')));
 await click('#welcomeLater');
 assert.ok(await $('.family-split').isHidden());assert.ok(await $('button.tab[data-go="card"]').isHidden());
 await click('button.tab[data-go="settings"]');await click('#layoutChoices summary');
 await $('#showCreditTab').check();await $('#showFamilySplit').check();
 await p.reload();assert.ok(await $('button.tab[data-go="card"]').isVisible());assert.ok(await $('.family-split').isVisible());
 await click('#firstBudget');await fill('#welcomeCash','15000');await fill('#welcomeDaily','500');await click('#welcomeForm button[type=submit]');assert.equal(await $('#v-home').evaluate(e=>e.classList.contains('active')),true);
 assert.deepEqual((await $('button.tab[data-go]').evaluateAll(nodes=>nodes.map(el=>el.dataset.go))).slice(0,2),['home','expense']);
 assert.ok(await $('#obligations').isHidden());await click('#nearestPayment summary');assert.ok(await $('#obligations').isVisible());await click('#nearestPayment summary');
 await click('#homeCalendar');assert.ok(await $('#moneyCalendarDialog').isVisible());await click('#moneyCalendarClose');
 await click('button.tab[data-go="analytics"]');await click('#advisorOpen');assert.ok(await $('#adviceOpening').isVisible());await click('#advisorClose');
 await click('button.tab[data-go="home"]');
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
 await click('#monthlyBillsPanel > summary');assert.ok(await $('#monthlyBillName').isVisible());await click('#monthlyBillsPanel > summary');
 for(let i=0;i<2;i++){await click('[data-ops-action="expense"]');if(width<500)assert.ok(await $('#smartVoiceButton').isHidden());await fill('#smartOperationText','продукты 500');await click('#smartOperationForm button[type=submit]');assert.ok(await $('#smartOperationContinue').isEnabled());await click('#smartOperationClose')}
 await p.reload();assert.equal((await data()).expenses.length,1);assert.deepEqual(errors,[]);
 await click('button.tab[data-go="card"]');
 for(const [kind,name] of [['loan','Кредит на ремонт'],['card','Запасная карта'],['card','Другая карта']]){
  await click('#creditAdd');await $('#creditKind').selectOption(kind);await fill('#creditName',name);await fill('#creditBalance','7000');
  if(kind==='loan'){await click('#creditStatement summary');await fill('#creditDue','2026-11-28');await fill('#creditDueAmount','1000');await fill('#creditInterest','100');}
  if(name==='Другая карта'){await click('#creditStatement summary');await fill('#creditDue','2026-12-02');await fill('#creditDueAmount','1000');await $('#creditFunding').selectOption('split');}
  await click('#creditForm button[type=submit]');
 }
 assert.equal((await data()).creditAccounts.length,3);
 await click('button.tab[data-go="plan"]');await click('#receiveAdvance');await fill('#receiptEntryAmount','5000');await click('#receiptEntryForm button[type=submit]');
 assert.equal((await data()).receipts.at(-1).amounts['account-'+(await data()).creditAccounts[0].id],1000);
 await click('button.tab[data-go="card"]');await $('#creditAccountList article').filter({hasText:'Кредит на ремонт'}).getByRole('button',{name:'Записать оплату'}).click();
 const saved=await data();assert.equal(saved.expenses.at(-1).principalCents,90000);assert.equal(saved.expenses.at(-1).amount,1000);
 const splitId='account-'+(await data()).creditAccounts[2].id;
 assert.equal((await data()).receipts.at(-1).amounts[splitId],500);
 await p.clock.setFixedTime(new Date('2026-12-01T10:00:00+03:00'));
 await click('button.tab[data-go="plan"]');await click('#receiveSalary');await fill('#receiptEntryAmount','5000');await click('#receiptEntryForm button[type=submit]');
 assert.equal((await data()).receipts.at(-1).amounts[splitId],500);
 await click('button.tab[data-go="card"]');
 await $('#creditAccountList article').filter({hasText:'Другая карта'}).getByRole('button',{name:'Закрыть карту'}).click();
 assert.equal((await data()).transfers.at(-1).amount,1000);assert.equal((await data()).transfers.at(-1).to,'family');
 assert.equal(await $('#creditAccountList article').count(),2);
 assert.match(await $('#creditAccountList').innerText(),/6\s?100/);
 await click('button.tab[data-go="settings"]');await click('#welcomeSettings');
 assert.ok(await $('#welcomeCash').isDisabled());assert.equal(await $('#welcomeDaily').inputValue(),'500');await click('#welcomeLater');
 await click('button.tab[data-go="analytics"]');await click('#advisorOpen');await click('#advisorGPT summary');assert.match(await $('#adviceText').inputValue(),/Потребительский кредит №1/);await click('#advisorClose');
 await p.reload();assert.ok(await $('#welcomeDialog').isHidden());
 assert.equal((await data()).creditAccounts.length,3);assert.deepEqual(errors,[]);
 // Simulate an existing profile from before the onboarding update.
 const legacy=await data();delete legacy.welcomeSeen;delete legacy.creditAccounts;
 legacy.monthlyBills=[];legacy.expenses=legacy.expenses.filter(e=>!e.creditAccount);legacy.debt=18000;
 await p.evaluate(profile=>localStorage.setItem('saldoza-test-budget-v1',JSON.stringify(profile)),legacy);
 await p.reload();assert.ok(await $('#welcomeDialog').isHidden());
 await click('button.tab[data-go="settings"]');await click('#welcomeSettings');
 await fill('#welcomeSalary','75000');await click('#welcomeWork summary');await fill('#welcomeWorkTotal','18');await fill('#welcomeWorkFirst','8');await fill('#welcomeTax','15');await $('#welcomeFamily').uncheck();await click('#welcomeForm button[type=submit]');
 assert.deepEqual((await data()).startBalances,legacy.startBalances);assert.equal((await data()).debt,18000);assert.equal((await data()).showFamilySplit,false);assert.equal((await data()).salaryConfig.taxRate,15);assert.ok(Object.values((await data()).months).some(m=>m.manualDaysTotal==='18'&&m.manualDaysFirst==='8'));
 await click('button.tab[data-go="card"]');await $('#v-card').getByRole('button',{name:'Закрыть ипотеку',exact:true}).click();
 await $('#v-card').getByRole('button',{name:'Закрыть карту',exact:true}).click();
 assert.ok(await $('#confirmMortgagePayment').isHidden());assert.ok(await $('#confirmCreditPayment').isHidden());
 assert.equal((await data()).closedLegacy.mortgage,true);assert.equal((await data()).closedLegacy.credit,true);
 console.log('PASS',width,file);await ctx.close();
}
}finally{await close()}})().catch(e=>{console.error(e);process.exitCode=1});
