import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portions, amountBetween, budgetFor, overview, monthCategoryTotals, dayNum, daysInMonth } from '../js/budget.js';
import { computeSplit, proportional } from '../js/split.js';
import { settlementFields } from '../js/balance.js';

const period = { start: '2026-10-07', end: '2027-01-31' };
const cats = [
  { id: 'rent', type: 'fixed', budget: 0 },
  { id: 'groceries', type: 'variable', budget: 30000 },
  { id: 'coffee', type: 'variable', budget: 6000 },
  { id: 'old', type: 'variable', budget: 99900, archived: true },
];
const tx = (f) => ({ kind: 'expense', spread: null, ...f, ...computeSplit({ amount: f.amount, mode: f.mode ?? 'mine', counterpartId: 'partner', customShare: f.customShare }) });

const rentAmounts = [203848, 197559, 200986, 147065];
const shares = proportional(rentAmounts, 399458);
const rent = rentAmounts.map((amount, i) => tx({
  id: `r${i}`, date: ['2026-10-03', '2026-10-28', '2026-11-27', '2026-12-28'][i], amount, categoryId: 'rent',
  mode: 'custom', customShare: shares[i], spread: { from: period.start, to: period.end },
}));

test('month helpers', () => {
  assert.equal(daysInMonth('2026-10'), 31);
  assert.equal(daysInMonth('2027-02'), 28);
  assert.equal(dayNum('2026-10-08') - dayNum('2026-10-07'), 1);
});

test('spread cost is divided by days and adds up exactly', () => {
  const p = portions(rent[0]);
  assert.deepEqual(p.map((x) => x.month), ['2026-10', '2026-11', '2026-12', '2027-01']);
  assert.equal(p.reduce((s, x) => s + x.cents, 0), rent[0].myShare);
  // 117 days in total: October has 25 of them.
  assert.equal(p[0].cents, Math.round((rent[0].myShare * 25) / 117));
});

test('all rent instalments together are a flat cost per day', () => {
  const totals = monthCategoryTotals(rent);
  const sum = Object.values(totals).reduce((s, m) => s + m.rent, 0);
  assert.equal(sum, 399458);
  assert.ok(Math.abs(totals['2026-11'].rent - Math.round((399458 * 30) / 117)) <= 4);
});

test('amountBetween takes the share of a spread inside a window', () => {
  const oct = amountBetween(rent[0], dayNum('2026-10-07'), dayNum('2026-10-31'));
  assert.equal(oct, portions(rent[0])[0].cents);
  assert.equal(amountBetween(rent[0], dayNum('2026-10-01'), dayNum('2026-10-06')), 0);
});

test('budgets are pro-rated for partial months', () => {
  assert.equal(budgetFor(cats[1], '2026-10', period), Math.round((30000 * 25) / 31));
  assert.equal(budgetFor(cats[1], '2026-11', period), 30000);
});

test('overview: this month, per-day allowance, top categories', () => {
  const txs = [
    ...rent,
    tx({ id: 'g1', date: '2026-10-08', amount: 4000, categoryId: 'groceries', mode: 'shared' }),
    tx({ id: 'c1', date: '2026-10-09', amount: 300, categoryId: 'coffee' }),
    tx({ id: 'c2', date: '2026-10-10', amount: 450, categoryId: 'coffee' }),
    { id: 's', date: '2026-10-10', ...settlementFields({ amount: 50000, personId: 'partner', theyPaidMe: true }) },
  ];
  const o = overview(txs, cats, period, '2026-10-10');
  const rentOct = rent.reduce((s, t) => s + portions(t)[0].cents, 0);
  assert.equal(o.month, '2026-10');
  assert.equal(o.monthSpent, rentOct + 2000 + 750, 'settlement is not spending');
  assert.equal(o.monthBudget, rentOct + Math.round((30000 * 25) / 31) + Math.round((6000 * 25) / 31), 'rent budgeted at cost; archived ignored');
  assert.equal(o.top[0].implicitBudget, true);
  assert.equal(o.daysLeft, 22);
  assert.equal(o.perDay, Math.floor(o.left / 22));
  assert.deepEqual(o.top.map((x) => x.category.id), ['rent', 'groceries', 'coffee']);
});

test('overview: projection = committed costs + average daily variable spend × days left', () => {
  const txs = [...rent, tx({ id: 'g1', date: '2026-10-07', amount: 1000, categoryId: 'groceries' })];
  const o = overview(txs, cats, period, '2026-10-08');            // 2 days elapsed
  assert.equal(o.avgDailyVariable, 500);
  assert.equal(o.remaining, dayNum('2027-01-31') - dayNum('2026-10-08'));
  assert.equal(o.projected, 399458 + 1000 + 500 * o.remaining);
  assert.equal(o.plan, 399458 + Math.round(30000 * 25 / 31) + Math.round(6000 * 25 / 31) + 36000 * 3);   // rent at cost; rounded per category
  assert.equal(o.gap, o.projected - o.plan);
});

test('overview before the exchange starts', () => {
  const o = overview(rent, cats, period, '2026-10-06');
  assert.equal(o.started, false);
  assert.equal(o.spentToDate, 0);
  assert.equal(o.projected, 399458);
  assert.equal(o.daysLeft, 25);
});

test('total view uses the full amount paid', () => {
  const o = overview(rent, cats, period, '2026-10-06', 'total');
  assert.equal(o.projected, 749458);
});

import { periodMonths, monthlyByCategory, cumulative } from '../js/budget.js';

test('chart data: months, per-category monthly totals and cumulative line', () => {
  const months = periodMonths(period);
  assert.deepEqual(months, ['2026-10', '2026-11', '2026-12', '2027-01']);
  const coffee = tx({ id: 'c', date: '2026-11-03', amount: 420, categoryId: 'coffee' });
  const byCat = monthlyByCategory([...rent, coffee], months, period);
  assert.equal(byCat.rent.reduce((a, b) => a + b, 0), 399458);
  assert.deepEqual(byCat.coffee, [0, 420, 0, 0]);

  const cum = cumulative([...rent, coffee], cats, period, '2026-11-30');
  assert.equal(cum.days.length, 117);
  assert.equal(cum.actual.at(-1), null, 'future days have no actual value');
  const lastKnown = cum.actual.filter((v) => v != null).at(-1);
  assert.equal(lastKnown, byCat.rent[0] + byCat.rent[1] + 420);
  assert.equal(cum.plan.at(-1), 399458 + Math.round(30000 * 25 / 31) + Math.round(6000 * 25 / 31) + 36000 * 3);
});
