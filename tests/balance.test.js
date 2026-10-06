import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceWith, settlementFields } from '../js/balance.js';
import { computeSplit, proportional } from '../js/split.js';

const rentAmounts = [180000, 175000, 170000, 125000];
const rentDates = ['2026-10-03', '2026-10-28', '2026-11-27', '2026-12-28'];
const shares = proportional(rentAmounts, 650000 - 300000);
const rent = rentAmounts.map((amount, i) => ({
  id: `r${i}`, date: rentDates[i], amount,
  ...computeSplit({ amount, mode: 'custom', customShare: shares[i], counterpartId: 'partner' }),
}));
const dinner = { id: 'd', date: '2026-10-10', amount: 6000, ...computeSplit({ amount: 6000, mode: 'shared', paidBy: 'partner' }) };
const groceries = { id: 'g', date: '2026-10-11', amount: 3000, ...computeSplit({ amount: 3000, mode: 'shared', counterpartId: 'partner' }) };

test('only rent already paid counts; the rest is upcoming', () => {
  const b = balanceWith(rent, 'partner', '2026-10-06');
  assert.equal(b.now, rentAmounts[0] - shares[0]);
  assert.equal(b.now + b.upcoming, 300000);
});

test('debts in both directions net out', () => {
  const b = balanceWith([dinner, groceries], 'partner', '2026-10-31');
  assert.equal(b.now, -3000 + 1500);
});

test('settling up brings the balance to zero', () => {
  const txs = [...rent, dinner, groceries];
  const before = balanceWith(txs, 'partner', '2026-10-31').now;
  assert.ok(before > 0);
  const settle = { id: 's', date: '2026-10-31', ...settlementFields({ amount: before, personId: 'partner', theyPaidMe: true }) };
  assert.equal(balanceWith([...txs, settle], 'partner', '2026-10-31').now, 0);
  assert.equal(settle.myShare, 0, 'a settlement is never spending');
});

test('I pay them back', () => {
  const settle = { id: 's', date: '2026-10-12', ...settlementFields({ amount: 1500, personId: 'partner', theyPaidMe: false }) };
  assert.equal(balanceWith([dinner, groceries, settle], 'partner', '2026-10-31').now, 0);
});
