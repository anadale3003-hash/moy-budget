/* Local reminders: no server, no financial amounts in notification text. */
(function(){
 const ID_MIN=100000000,ID_MAX=300000000,TEST_ID=900000001;
 const localDate=(d)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 const dateAt=(key,h,m=0)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(key||''))return null;const [y,mo,d]=key.split('-').map(Number);const x=new Date(y,mo-1,d,h,m);return localDate(x)===key?x:null;};
 const addDays=(d,n)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);
 function makeReminderPlan({now,mode,receipts=[],frequency,days={},payday,bills=[],mortgage=null,legacyCard=null,configured=true}){
  if(!configured||!['all','pay'].includes(mode))return [];
  const today=localDate(now),end=localDate(addDays(now,89)),groups=new Map();
  function add(date,kind,text){
   if(date<today||date>end||!dateAt(date,8,30))return;
   const key=date+'|'+kind;
   if(!groups.has(key))groups.set(key,new Set());
   groups.get(key).add(text);
  }
  const confirmed=new Set(receipts.filter(r=>r.date<=today).map(r=>r.id));
  const single=frequency==='once';
  for(let i=-2;i<=4;i++){
   const cycle=new Date(now.getFullYear(),now.getMonth()+i,1),period=localDate(cycle).slice(0,7);
   for(const type of single?['salary']:['advance','salary']){
    const day=Number(days[type])||(type==='advance'?16:1);
    const shift=type==='salary'&&!single&&Number(days.salary||1)<=Number(days.advance||16)?1:0;
    const target=new Date(cycle.getFullYear(),cycle.getMonth()+shift,1);
    if(confirmed.has(period+'-'+type))continue;
    const due=payday(localDate(target).slice(0,7),day);
    if(due instanceof Date&&!Number.isNaN(due.getTime()))add(localDate(due),'pay',type==='advance'?'Проверь поступление аванса.':'Проверь поступление зарплаты.');
   }
  }
  if(mode==='all'){
   for(const bill of bills)if(bill.remaining>0&&dateAt(bill.due,8,30))add(bill.due<today?today:bill.due,'bill','Проверь обязательные платежи в Saldoza.');
   for(const item of [mortgage,legacyCard])if(item?.remaining>0&&dateAt(item.due,8,30))add(item.due<today?today:item.due,'bill','Проверь обязательные платежи в Saldoza.');
   for(let i=0;i<90;i++){
    const d=addDays(now,i),key=localDate(d);
    add(key,'daily','Если были расходы или доходы, внеси их в бюджет.');
    if(addDays(d,1).getDate()===1)add(key,'month','Проверь итоги месяца в Saldoza.');
   }
  }
  const kinds={pay:[0,8,30,'День выплаты'],bill:[1,9,0,'Обязательные платежи'],daily:[2,20,0,'Время обновить бюджет'],month:[3,19,0,'Итоги месяца']};
  return [...groups].flatMap(([key,messages])=>{
   const [date,kind]=key.split('|'),[offset,h,m,title]=kinds[kind],at=dateAt(date,h,m);
   return at&&at>now?[{id:ID_MIN+Number(date.replace(/-/g,''))*4+offset,title:'Saldoza · '+title,body:[...messages].join(' '),schedule:{at,allowWhileIdle:true},smallIcon:'ic_saldoza_notification'}]:[];
  }).sort((a,b)=>a.schedule.at-b.schedule.at||a.id-b.id);
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={makeReminderPlan};return;}
 const choice=document.getElementById('notifyReminderChoice'),enable=document.getElementById('notifyEnableBtn'),test=document.getElementById('notifyTestBtn'),status=document.getElementById('notifyStatus');
 if(!choice||!enable||!test||!status)return;
 const pref='saldoza-android-reminders-v1',signatureKey='saldoza-android-reminder-plan-v1';
 const get=(k)=>{try{return localStorage.getItem(k)}catch(_){return null}};
 const put=(k,v)=>{try{localStorage.setItem(k,v);return true}catch(_){return false}};
 choice.value=['all','pay','none'].includes(get(pref))?get(pref):'none';
 const plugin=()=>window.Capacitor?.Plugins?.LocalNotifications;
 const own=n=>Number(n.id)>=ID_MIN&&Number(n.id)<ID_MAX;
 const say=t=>status.textContent=t;
 let sequence=Promise.resolve(),timer=null;
 function plan(){
  const now=new Date(),key=localDate(now),mortgage=upcomingMortgage(now);
  return makeReminderPlan({now,mode:choice.value,receipts:data.receipts||[],frequency:data.payFrequency,days:data.payDays,payday:plannedPayday,
   configured:!!data.startBalances,
   bills:monthlyBillRows(key).filter(r=>r.nextDue).map(r=>({due:r.nextDue,remaining:r.nextCents})),
   mortgage:{due:localDate(mortgage.due),remaining:mortgage.remaining},
   legacyCard:!data.closedLegacy?.credit?{due:data.deadline,remaining:creditOutstanding()}:null});
 }
 async function sync(request=false){
  const p=plugin();
  if(!p){say('Нативные уведомления недоступны в этой сборке.');return;}
  const mode=choice.value;
  if(mode==='none'){
   const pending=(await p.getPending()).notifications||[];
   const cancel=pending.filter(n=>own(n)||n.id===TEST_ID).map(n=>({id:n.id}));
   if(cancel.length)await p.cancel({notifications:cancel});
   put(signatureKey,'{}');say('Напоминания выключены.');return;
  }
  let permission=await p.checkPermissions();
  if(request&&permission.display!=='granted')permission=await p.requestPermissions();
  if(permission.display!=='granted'){say('Разреши уведомления Android кнопкой ниже или в настройках телефона.');return;}
  const desired=plan();
  let previous={};try{previous=JSON.parse(get(signatureKey)||'{}')||{}}catch(_){}
  const signatures=Object.fromEntries(desired.map(n=>[n.id,JSON.stringify(n)]));
  const pending=((await p.getPending()).notifications||[]).filter(own);
  const existing=new Set(pending.map(n=>n.id));
  const cancel=pending.filter(n=>signatures[n.id]!==previous[n.id]||!signatures[n.id]).map(n=>({id:n.id}));
  const removed=new Set(cancel.map(n=>n.id));
  if(cancel.length)await p.cancel({notifications:cancel});
  const additions=desired.filter(n=>!existing.has(n.id)||removed.has(n.id));
  if(additions.length)await p.schedule({notifications:additions});
  put(signatureKey,JSON.stringify(signatures));
  say(desired.length?'Напоминания включены. Время местное; Android может доставить их позже. Расписание обновляется при открытии приложения.':'Разрешение получено. Настрой бюджет, чтобы создать расписание.');
 }
 function enqueue(request=false){
  sequence=sequence.catch(()=>{}).then(()=>sync(request)).catch(e=>say('Не удалось настроить напоминания. '+String(e?.message||e)));
  return sequence;
 }
 function debounce(){clearTimeout(timer);timer=setTimeout(()=>enqueue(),300);}
 choice.addEventListener('change',()=>{if(!put(pref,choice.value)){say('Не удалось сохранить выбор.');return;}enqueue();});
 enable.addEventListener('click',async()=>{if(choice.value==='none'){say('Сначала выбери, о чём напоминать.');return;}enable.disabled=true;try{await enqueue(true)}finally{enable.disabled=false;}});
 test.addEventListener('click',async()=>{
  const p=plugin();if(!p){say('Нативные уведомления недоступны.');return;}
  test.disabled=true;
  try{
   let permission=await p.checkPermissions();
   if(permission.display!=='granted')permission=await p.requestPermissions();
   if(permission.display!=='granted'){say('Разрешение на уведомления не получено.');return;}
   await p.cancel({notifications:[{id:TEST_ID}]});
   await p.schedule({notifications:[{id:TEST_ID,title:'Saldoza',body:'Тестовое уведомление',smallIcon:'ic_saldoza_notification',schedule:{at:new Date(Date.now()+30000),allowWhileIdle:true}}]});
   say('Тест запланирован примерно через 30 секунд. Android может задержать доставку.');
  }catch(e){say('Не удалось запланировать тест: '+String(e?.message||e));}finally{test.disabled=false;}
 });
 window.addEventListener('budget:local-saved',debounce);
 window.addEventListener('onboarding:budget-saved',debounce);
 window.addEventListener('pageshow',debounce);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')debounce()});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',debounce,{once:true});else debounce();
})();
