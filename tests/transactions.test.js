import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterTransactions, INBOX, isScheduled } from '../js/transactions.js';
import { monthsBetween } from '../js/format.js';

const txs = [
  { id: 1, date: '2026-10-07', description: 'Monoprix Bastille', note: '', categoryId: 'groceries', splitMode: 'shared', counterpartId: 'partner' },
  { id: 2, date: '2026-10-20', description: 'Café de Flore', note: 'with a friend', categoryId: 'coffee', splitMode: 'mine', counterpartId: null },
  { id: 3, date: '2026-11-02', description: 'Unknown shop', note: '', categoryId: null, splitMode: 'mine', counterpartId: null },
];
const ids = (f) => filterTransactions(txs, f, { coffee: { name: 'Coffee & bars' } }).map((t) => t.id);

test('filters combine', () => {
  assert.deepEqual(ids({}), [1, 2, 3]);
  assert.deepEqual(ids({ month: '2026-10' }), [1, 2]);
  assert.deepEqual(ids({ cat: INBOX }), [3]);
  assert.deepEqual(ids({ cat: 'coffee' }), [2]);
  assert.deepEqual(ids({ split: 'shared', person: 'partner' }), [1]);
});

test('search covers description, note and category name, accent-insensitive', () => {
  assert.deepEqual(ids({ q: 'cafe' }), [2]);
  assert.deepEqual(ids({ q: 'friend' }), [2]);
  assert.deepEqual(ids({ q: 'coffee' }), [2]);
});

test('scheduled = dated after today', () => {
  assert.equal(isScheduled({ date: '2026-12-28' }, '2026-10-06'), true);
  assert.equal(isScheduled({ date: '2026-10-06' }, '2026-10-06'), false);
});

test('monthsBetween spans the year boundary', () => {
  assert.deepEqual(monthsBetween('2026-10-07', '2027-01-31'), ['2026-10', '2026-11', '2026-12', '2027-01']);
});
