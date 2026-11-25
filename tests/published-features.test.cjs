const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const page of ['index.html', 'preview.html']) {
  const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
  function functions(first, next) {
    const start = html.indexOf('function ' + first + '(');
    const end = html.indexOf('function ' + next + '(', start);
    assert.ok(start >= 0 && end > start);
    return html.slice(start, end);
  }
  test(page + ' — purchase preview respects bills and creates no operation', () => {
    const context = vm.createContext({});
    vm.runInContext(functions('purchaseCents', 'dailyBudgetValue'), context);
    const snapshot = {debt:0, cash:{family:15000,actual:{available:15000},days:6,
      next:{date:'2026-12-01'},bills:3000,familyBills:3000,sameDayBills:0,sameDayFamilyBills:0}};
    const before = JSON.stringify(snapshot);
    const result = context.evaluatePurchase(snapshot,4000,1500,0,'2026-11-25');
    assert.equal(result.free,1200000);
    assert.equal(result.after,-100000);
    assert.equal(result.status,'shortfall');
    assert.equal(JSON.stringify(snapshot),before);
  });
  test(page + ' — calendar flags a shortage before income arrives on the same day', () => {
    const context = vm.createContext({});
    vm.runInContext(functions('calendarForecast', 'calendarSnapshot'), context);
    const date='2026-12-01';
    const days=context.calendarForecast([date],10000,0,{mortgageReserve:5000,creditReserve:0,
      rows:[{kind:'income',date,cents:40000},{kind:'mortgage',date,cents:20000}]});
    assert.equal(days[0].balance,35000);
    assert.equal(context.calendarOverview(days).first.shortfall,5000);
  });
  test(page + ' — latest confirmed category wins and removed types are ignored', () => {
    const context = vm.createContext({});
    vm.runInContext(functions('isWifeTransferType','refreshTypes'),context);
    vm.runInContext(functions('learnedSmartCategory','smartLearningKeyForSave'),context);
    const expenses=['Продукты','Кафе'].map(type=>({type,category:'family',smartCategoryKey:'кофе'}));
    assert.equal(context.learnedSmartCategory('кофе',expenses,{family:['Кафе','Продукты']}).type,'Кафе');
    assert.equal(context.learnedSmartCategory('кофе',expenses,{family:['Продукты']}).type,'Продукты');
    assert.equal(context.learnedSmartCategory('чай',expenses,{family:['Продукты']}),null);
  });
}
