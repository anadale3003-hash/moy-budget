const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const page of ['index.html', 'preview.html']) {
  test(page + ' — partial credit payments, envelope top-up and undo', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    // Run the functions embedded in the shipped page. Stub only UI and clock inputs.
    const names = ['num', 'creditOutstanding', 'repaymentTotal', 'regularPaymentSum',
      'regularCreditAvailable', 'paymentFunding', 'confirmRegularPayment',
      'transferDelta', 'categoryBalanceAt', 'actualMoneyToday', 'mortgageReserveSpent'];
    const date = '2026-11-25';
    const data = {
      startBalances: { date: '2026-11-01', balances: { family: 500 } },
      expenses: [], transfers: [], receipts: [], regularPayments: [], reserved: 0, debt: 2000,
      extraIncomes: [{ destination: 'credit', date: '2026-11-20', amount: 1000 }]
    };
    let undo;
    const context = vm.createContext({
      data, cats: [{ id: 'family' }], month: '2026-11', iso: () => date,
      fromISO: value => new Date(value), rub: String, confirm: () => true,
      creditPaymentFeedback() {}, closePaymentEntry() {}, renderAll() {},
      $: () => ({ addEventListener: (_, listener) => { undo = listener; } })
    });
    for (const name of names) {
      const start = source.indexOf('function ' + name + '(');
      assert.ok(start >= 0, name);
      const firstLineEnd = source.indexOf('\n', start);
      const end = source[firstLineEnd - 1] === '}' ? firstLineEnd : source.indexOf('\n}', firstLineEnd) + 2;
      vm.runInContext(source.slice(start, end), context);
    }
    const start = source.indexOf("$('regularPaymentHistory').addEventListener");
    vm.runInContext(source.slice(start, source.indexOf('\n});', start) + 4), context);
    const pay = (amount, day = date, envelope = '') =>
      context.confirmRegularPayment('credit', amount, day, envelope);
    const reserve = () => context.actualMoneyToday().creditReserve;
    function undoLast() {
      const id = data.regularPayments.at(-1).id;
      undo({ target: { closest: () => ({ dataset: { undoRegular: id } }) } });
    }
    assert.equal(pay(600), null);
    assert.equal(reserve(), 400);
    assert.equal(context.paymentFunding('credit', 600, '2026-11-24').extraAmount, 200);
    assert.match(pay(600), /200/);
    assert.equal(data.regularPayments.length, 1);
    assert.equal(context.creditOutstanding(), 1400);
    assert.equal(pay(600, date, 'family'), null);
    assert.equal(reserve(), 0);
    assert.equal(context.categoryBalanceAt('family', date), 300);
    assert.equal(context.creditOutstanding(), 800);
    undoLast();
    assert.equal(reserve(), 400);
    assert.equal(context.categoryBalanceAt('family', date), 500);
    undoLast();
    assert.equal(reserve(), 1000);
    data.reserved = 100.25;
    assert.equal(pay(600.50), null);
    assert.equal(reserve(), 499.75);
    undoLast();
    assert.equal(data.reserved, 100.25);
    assert.equal(reserve(), 1100.25);
  });
}
