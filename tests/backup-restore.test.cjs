const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const page of ['index.html','preview.html']) {
  test(page + ' restores a backup atomically', async () => {
    const source = fs.readFileSync(path.join(__dirname,'..',page),'utf8');
    const chunk = (start,end) => source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
    const elements = new Map(), messages = [], storage = new Map();
    const get = id => {
      if (!elements.has(id)) elements.set(id,{});
      return elements.get(id);
    };
    let approved = true, canWrite = true, renderedDebt;
    const context = vm.createContext({
      SALDOZA_BUDGET_KEY:'test-budget',
      localStorage: {
        getItem:key=>storage.get(key),
        setItem(key,value){if(!canWrite)throw Error('quota');storage.set(key,value)}
      },
      document:{getElementById:get},confirm:()=>approved,alert:text=>messages.push(text),
      render:()=>{},showSaveFeedback:text=>messages.push(text),
      refreshBudgetView(){
        const debt=run('data.debt');
        if(debt===999)throw Error('render failure');
        renderedDebt=debt;
      }
    });
    const run = script => vm.runInContext(script,context);
    run(chunk('const THEMES=','let month=currentMonth;'));
    run("let lastSavedReceiptSignature='[]',saveFeedbackIntent=null,saveFeedbackClearTimer=null;");
    run(chunk('function save(){','function num('));
    run(chunk('function readBackup(text){','const APP_VERSION='));
    run("data.debt=123;data.expenses=[{id:'before',date:'2026-11-25',amount:3,category:'family'}];save()");
    const oldState=Array.from(storage.values())[0];
    const valid=JSON.parse(oldState);
    valid.debt=42;
    valid.expenses[0].id='restored';
    delete valid.salaryConfig;
    delete valid.regularPayments;
    async function importText(text){
      const input=get('importData');
      input.files=[{text:async()=>text}];input.value='backup.json';
      await input.onchange({currentTarget:input});
      assert.equal(input.value,'');
    }
    const pack = data => JSON.stringify({version:1,data});
    function intact(){
      assert.equal(Array.from(storage.values())[0],oldState);
      assert.equal(run('data.debt'),123);
      assert.equal(run('data.expenses[0].id'),'before');
    }
    for (const bad of ['{',pack({months:{},weights:{},expenses:[]}),pack({...valid,receipts:[null]}),JSON.stringify({version:2,data:valid})]) {
      await importText(bad);intact();
    }
    approved=false;await importText(pack(valid));intact();approved=true;
    await importText(pack({...valid,debt:999}));intact();assert.equal(renderedDebt,123);
    canWrite=false;await importText(pack(valid));intact();assert.equal(renderedDebt,123);
    canWrite=true;await importText(pack(valid));
    const saved=JSON.parse(Array.from(storage.values())[0]);
    assert.equal(renderedDebt,42);assert.equal(saved.expenses[0].id,'restored');
    assert.deepEqual(saved.regularPayments,[]);assert.equal(saved.salaryConfig.taxRate,13);
    assert.equal(messages.filter(x=>x==='Данные восстановлены').length,1);
  });
}
