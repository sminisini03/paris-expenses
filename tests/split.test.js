import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSplit, owedToMe, proportional, sharePct } from '../js/split.js';

const tx = (args) => ({ amount: args.amount, ...computeSplit({ counterpartId: 'partner', ...args }) });

test('mine: no one owes anything', () => {
  const t = tx({ amount: 5000, mode: 'mine' });
  assert.deepEqual([t.myShare, t.iPaid, owedToMe(t), t.counterpartId], [5000, 5000, 0, null]);
});

test('shared 50/50 that I paid: partner owes half', () => {
  const t = tx({ amount: 5001, mode: 'shared' });
  assert.equal(t.myShare + (t.iPaid - t.myShare), 5001);
  assert.equal(owedToMe(t), 2500);
});

test('theirs: partner owes everything', () => {
  assert.equal(owedToMe(tx({ amount: 1200, mode: 'theirs' })), 1200);
});

test('partner paid a shared dinner: I owe half', () => {
  const t = tx({ amount: 6000, mode: 'shared', paidBy: 'partner' });
  assert.equal(owedToMe(t), -3000);
  assert.equal(t.counterpartId, 'partner');
});

test('refund of a shared purchase reverses what partner owed', () => {
  const buy = tx({ amount: 2000, mode: 'shared' });
  const refund = tx({ amount: -2000, mode: 'shared' });
  assert.equal(owedToMe(buy) + owedToMe(refund), 0);
});

test('rent: custom share split across instalments adds up exactly', () => {
  const instalments = [180000, 175000, 170000, 125000];
  const total = instalments.reduce((a, b) => a + b, 0);
  assert.equal(total, 650000);
  const shares = proportional(instalments, 650000 - 300000);
  assert.equal(shares.reduce((a, b) => a + b, 0), 350000);
  const owed = instalments.reduce((s, a, i) => s + owedToMe(tx({ amount: a, mode: 'custom', customShare: shares[i] })), 0);
  assert.equal(owed, 300000);
  assert.equal(sharePct({ amount: instalments[0], myShare: shares[0] }), 53.8);
});
