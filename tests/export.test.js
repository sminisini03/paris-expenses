import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkbookData } from '../js/export.js';
import { computeSplit, proportional } from '../js/split.js';
import { settlementFields } from '../js/balance.js';

const period = { start: '2026-10-07', end: '2027-01-31' };
const categories = [
  { id: 'rent', name: 'Rent & housing', type: 'fixed', budget: 0, order: 0 },
  { id: 'groceries', name: 'Groceries', type: 'variable', budget: 30000, order: 1 },
  { id: 'travel', name: 'Travel & weekends', type: 'variable', budget: 0, order: 2 },
];
const people = [{ id: 'me', name: 'Simone' }, { id: 'partner', name: 'Maya' }];
const amts = [203848, 197559, 200986, 147065];
const shares = proportional(amts, 399458);
const txs = [
  ...amts.map((amount, i) => ({ id: `r${i}`, kind: 'expense', source: 'plan', date: ['2026-10-03', '2026-10-28', '2026-11-27', '2026-12-28'][i], description: `Rent ${i + 1}`, categoryId: 'rent', amount,
    spread: { from: period.start, to: period.end }, ...computeSplit({ amount, mode: 'custom', customShare: shares[i], counterpartId: 'partner' }) })),
  { id: 'f', kind: 'expense', source: 'plan', date: '2026-10-07', description: 'Flights', categoryId: 'travel', amount: 20200, spread: null, ...computeSplit({ amount: 20200 }) },
  { id: 'g', kind: 'expense', source: 'manual', date: '2026-11-02', description: 'Monoprix', categoryId: 'groceries', amount: 5000, spread: null, ...computeSplit({ amount: 5000, mode: 'shared', counterpartId: 'partner' }) },
  { id: 's', source: 'manual', date: '2026-11-05', description: 'Maya paid me', ...settlementFields({ amount: 50000, personId: 'partner', theyPaidMe: true }) },
];
const { summary, transactions } = buildWorkbookData({ txs, categories, people, period });
const row = (title, name) => {
  const start = summary.findIndex((r) => r[0]?.startsWith?.(title));
  return summary.slice(start).find((r) => r[0] === name);
};

test('Overall block reproduces the cost sheet: rent total / Maya / me', () => {
  assert.deepEqual(summary[1], ['Category', 'Total', 'Maya', 'Simone', 'Budget (Simone)']);
  assert.deepEqual(row('Overall', 'Rent & housing').slice(1, 4), [7494.58, 3500, 3994.58]);
  assert.deepEqual(row('Overall', 'Travel & weekends').slice(1, 4), [202, 0, 202]);
});

test('settlements are not spending; totals add up', () => {
  const total = row('Overall', 'Total');
  assert.equal(total[1], 7494.58 + 202 + 50);
  assert.equal(total[2], 3500 + 25);
});

test('monthly blocks spread rent and pro-rate budgets', () => {
  // A budgeted category is listed even in a month without spending.
  assert.deepEqual(row('October 2026', 'Groceries'), ['Groceries', 0, 0, 0, 241.94]);
  const novG = row('November 2026', 'Groceries');
  assert.deepEqual(novG, ['Groceries', 50, 25, 25, 300]);
  const octRent = row('October 2026', 'Rent & housing');
  assert.ok(Math.abs(octRent[1] - 7494.58 * 25 / 117) < 0.05);
});

test('transactions sheet lists everything incl. settlements', () => {
  assert.equal(transactions.length, 1 + txs.length);
  const s = transactions.find((r) => r[1] === 'Maya paid me');
  assert.equal(s[3], 'Settlement');
  assert.equal(s[7], 'Maya');
});
