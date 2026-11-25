const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function harness(page){
 const html=fs.readFileSync(path.join(__dirname,'..',page),'utf8');
 const between=(start,end)=>{
  const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,start);
  return html.slice(a,b);
 };
 const nodes=new Map();
 function element(id){
  if(!nodes.has(id))nodes.set(id,{
   textContent:'',value:'',classList:{remove(){}},
   addEventListener(type,handler){this[type]=handler},replaceChildren(){},
   append(child){this.textContent=child.textContent},reportValidity:()=>true,reset(){}
  });
  return nodes.get(id);
 }
 let persist=true,nextId=0;
 const alerts=[];
 class Clock extends Date{constructor(...args){super(...(args.length?args:[2026,10,25,12]))}}
 const context=vm.createContext({
  Date:Clock,Option:class{},crypto:{randomUUID:()=>String(++nextId)},location:{},
  document:{getElementById:element,createElement:()=>({})},
  localStorage:{getItem:()=>null},alert:message=>alerts.push(message),confirm:()=>true,
  save:()=>persist,refreshBudgetView:()=>run('renderMonthlyBills()'),
  fromISO:undefined,wifeFunds:()=>0,nearestPayday:()=>({type:'salary',date:new Clock(2026,11,1)}),
 });
 const run=script=>vm.runInContext(script,context);
 run('const SALDOZA_BUDGET_KEY="test";');
 run(between('function dailyBudgetValue(', 'function syncDailyBudgetSetting('));
 run(between('function calendarValidPlan(', 'function calendarAddDays('));
 run(between('const THEMES=','let month=currentMonth;'));
 run(between('function num(n)','function dateFor('));
 run(between('function esc(s)','function sumExpenses('));
 run(between('function transferDelta(','function realBalance('));
 run(between('function validMonthlyBill(','function nextPaydays('));
 run(between('function renderMonthlyBills()','function refreshBudgetView()'));
 run(between('function readBackup(text){',"$('importClick').onclick"));
 run("data.startBalances={date:'2026-01-01',balances:{family:15000,other:10000}}");
 function add(name,amount,firstDue,category='family'){
  element('monthlyBillName').value=name;element('monthlyBillAmount').valueAsNumber=amount;
  element('monthlyBillDate').value=firstDue;element('monthlyBillCategory').value=category;
  const form=element('monthlyBillForm');form.submit({currentTarget:form,preventDefault(){}});
 }
 function click(dataset){element('monthlyBillList').click({target:{closest:()=>({dataset})}})}
 function daily(){
  run("showPaydayCountdown({available:categoryBalanceAt('family',iso(new Date()))+categoryBalanceAt('other',iso(new Date()))})");
  return element('dailySpendingLimit').textContent;
 }
 return {run,add,click,element,daily,alerts,setWritable:value=>{persist=value}};
}

for(const page of ['index.html','preview.html']){
 test(page+' — reserve, confirm, double click, restore and stop',()=>{
  const h=harness(page);
  assert.equal(h.daily(),h.run('rub(2500)'));
  h.add('Садик',3000,'2026-11-28');
  assert.equal(h.run('data.expenses.length'),0);
  assert.equal(h.daily(),h.run('rub(2000)'));
  assert.match(h.element('nextPaymentDate').textContent,/Садик/);
  const target={payBill:'1',billDue:'2026-11-28'};
  h.setWritable(false);h.click(target);
  assert.equal(h.run('data.expenses.length'),0);
  h.setWritable(true);h.click(target);h.click(target);
  assert.equal(h.run('data.expenses.length'),1);
  assert.equal(h.run('data.expenses[0].date'),'2026-11-25');
  assert.equal(h.run('data.expenses[0].category'),'family');
  assert.equal(h.run('data.expenses[0].amount'),3000);
  assert.equal(h.daily(),h.run('rub(2000)'));
  assert.doesNotMatch(h.element('nextPaymentDate').textContent,/Садик/);
  h.run('data=readBackup(JSON.stringify({version:1,data}))');
  assert.equal(h.run("monthlyBillRows('2026-12-01')[0].nextDue"),'2026-12-28');
  h.click({stopBill:'1'});
  assert.equal(h.run('data.monthlyBills.length'),0);
  assert.equal(h.run('data.expenses.length'),1);
 });
 test(page+' — envelope boundaries, overdraft, cancellation and payday cutoff',()=>{
  const h=harness(page);
  h.add('Семейный',1000,'2026-12-01');
  h.add('Прочее',12000,'2026-11-28','other');
  assert.equal(h.daily(),h.run('rub(2500)'));
  h.click({payBill:'2',billDue:'2026-11-28'});
  assert.equal(h.run('data.expenses.length'),0);
  h.add('Еда',300,'2026-11-26');
  assert.equal(h.daily(),h.run('rub(2450)'));
  h.click({stopBill:'3'});assert.equal(h.daily(),h.run('rub(2500)'));
  assert.throws(()=>h.run('readBackup(JSON.stringify({version:1,data:{...data,monthlyBills:[{}]}}))'));
 });
 test(page+' — missed dates, short months, leap year and deleted payment',()=>{
  const h=harness(page);
  h.add('Платёж',10.25,'2024-01-31');
  assert.equal(h.run("monthlyBillRows('2024-03-01')[0].count"),2);
  h.click({payBill:'1',billDue:'2024-01-31'});
  assert.equal(h.run("monthlyBillRows('2024-03-01')[0].nextDue"),'2024-02-29');
  h.click({payBill:'1',billDue:'2024-02-29'});
  assert.equal(h.run("monthlyBillRows('2024-04-01')[0].nextDue"),'2024-03-31');
  h.run('data.expenses.pop()');
  assert.equal(h.run("monthlyBillRows('2024-03-01')[0].nextDue"),'2024-02-29');
 });
}

for(const page of ['index.html','preview.html']){
 test(page+' — рассрочка с коротким последним платежом',()=>{
  const h=harness(page);
  h.element('monthlyBillTotal').value='2500';
  h.element('monthlyBillTotal').valueAsNumber=2500;
  h.add('Телефон',1000,'2026-10-31');
  const reserve=()=>h.run("billReserve(monthlyBillRows('2027-01-01'))");
  assert.equal(reserve(),2500);
  for(const [due,left] of [['2026-10-31',1500],['2026-11-30',500],['2026-12-31',0]]){
   h.click({payBill:'1',billDue:due});
   assert.equal(reserve(),left);
  }
  assert.equal(h.run('data.expenses[2].amount'),500);
  assert.match(h.element('monthlyBillList').innerHTML,/погашена/);
  h.run('data.expenses.pop()');
  assert.equal(reserve(),500);
 });
}
