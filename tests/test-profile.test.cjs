const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

for(const page of ['index.html','preview.html']){
 test(page+' isolates budget, reminders and push registration',async()=>{
  const html=fs.readFileSync(path.join(__dirname,'..',page),'utf8');
  for(const [,script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(script);
  const scope='https://example.test/test/';
  const personal={scope,active:{scriptURL:scope+'sw.js'}};
  let registration=personal, installs=0;
  const serviceWorker={
   getRegistration:async()=>registration,
   register:async url=>{installs++;registration={scope,active:{scriptURL:url}}}
  };
  const existing=new Map([
   ['my-budget-v1',JSON.stringify({months:{},weights:{},expenses:[{id:'personal'}]})],
   ['my-budget-orchid-preview',JSON.stringify({months:{},weights:{},expenses:[{id:'legacy-copy'}]})],
   ['budget-notification-preferences-v1','none']
  ]);
  const store=new Map(existing),accessed=new Set();
  const localStorage={
   getItem:key=>{accessed.add(key);return store.get(key)??null},
   setItem:(key,value)=>{accessed.add(key);store.set(key,value)}
  };
  const runPage=()=>{
   const context=vm.createContext({localStorage,location:{href:scope+page},URL,navigator:{serviceWorker}});
   const run=source=>vm.runInContext(source,context);
   run(html.slice(html.indexOf('const SALDOZA_BUDGET_KEY'),html.indexOf("(function(){'use strict';\nconst THEMES")));
   run(html.slice(html.indexOf('const THEMES='),html.indexOf('for(const c of cats){if(!Array.isArray(data.expenseTypes')));
   run("let lastSavedReceiptSignature='[]',saveFeedbackIntent=null,saveFeedbackClearTimer=null;");
   run(html.match(/function save\(\)\{[\s\S]*?\n\}/)[0]);
   run(html.match(/const preferenceKey=[^;]+;/)[0]+html.match(/const appSettings=\(\)=>\{[\s\S]*?\n  \};/)[0]);
   return run;
  };
  let run=runPage();
  assert.equal(run('data.expenses.length'),0);
  assert.equal(run("data.expenses.push({id:'test'});save()"),true);
  assert.equal(run('appSettings().expenses[0].id'),'test');
  assert.equal(run('localStorage.getItem(preferenceKey)'),null);
  run("localStorage.setItem(preferenceKey,'all')");
  run=runPage();
  assert.equal(run('data.expenses[0].id'),'test');
  assert.equal(run('localStorage.getItem(preferenceKey)'),'all');
  for(const [key,value] of existing){
   assert.equal(store.get(key),value);
   assert.equal(accessed.has(key),false);
  }
  await run('installTestWorker()');
  assert.equal(installs,0);
  await assert.rejects(run('testPushRegistration()'));
  registration={...personal,scope:'https://example.test/'};
  await run('installTestWorker()');
  assert.equal(installs,1);
  assert.equal(await run('testPushRegistration()'),registration);
 });
}

test('activation removes only obsolete caches for this test scope',async()=>{
 const scope='https://example.test/test/';
 const prefix='saldoza-test:'+scope+':';
 const keys=['family-budget-v1-5-104','saldoza-test:https://example.test/other/:old',prefix+'old',prefix+'1-5-104'];
 const removed=[],handlers={};
 const script=fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8');
 vm.runInNewContext(script,{
  caches:{keys:async()=>keys,delete:async key=>removed.push(key)},
  self:{registration:{scope},clients:{claim(){}},addEventListener:(type,fn)=>{handlers[type]=fn}}
 });
 let completion;
 handlers.activate({waitUntil:p=>{completion=p}});
 await completion;
 assert.deepEqual(removed,[prefix+'old']);
});
