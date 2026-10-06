import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planImport, parseCsv } from '../js/import.js';

const csv = readFileSync(new URL('./fixtures/revolut-sample.csv', import.meta.url), 'utf8');
const rules = [
  { id: 'r1', keyword: 'MONOPRIX', categoryId: 'groceries', split: 'shared' },
  { id: 'r2', keyword: 'CAFE', categoryId: 'coffee', split: null },
  { id: 'r3', keyword: 'HOTEL', categoryId: 'travel', split: null },
  { id: 'r4', keyword: 'ZARA', categoryId: 'shopping', split: null },
  { id: 'r5', keyword: 'PRET A MANGER', categoryId: 'eating', split: null },
];
const plannedRent = { id: 'plan-rent-1', source: 'plan', fingerprint: null, date: '2026-10-03', amount: 180000, description: 'Airbnb rent · instalment 1/4' };
let n = 0;
const opts = {
  periodStart: '2026-10-07', periodEnd: '2027-01-31', currency: 'EUR',
  selfNames: ['Alex Example'], defaultCounterpart: 'partner',
  batchId: 'b1', newId: () => `t${++n}`, now: '2026-10-20T12:00:00Z',
};
const first = planImport(csv, [plannedRent], rules, opts);
const byDesc = (d) => first.add.filter((t) => t.description === d);
const reasons = Object.fromEntries(first.summary.excluded.map((e) => [e.row.description, e.reason]));

test('CSV parser handles quoted commas', () => {
  assert.deepEqual(parseCsv('a,"b, c",d\n1,"say ""hi""",3'), [['a', 'b, c', 'd'], ['1', 'say "hi"', '3']]);
});

test('summary counts', () => {
  const s = first.summary;
  assert.equal(s.rows, 20);
  assert.equal(s.linked, 1, 'Airbnb confirms the planned rent instead of duplicating it');
  assert.equal(s.added, 9);
  assert.equal(s.excluded.length, 10);
  assert.equal(s.uncategorized, 2);
  assert.equal(s.duplicates, 0);
});

test('exclusions carry a reason', () => {
  assert.equal(reasons['TELCO MOBILE'], 'Outside the exchange period');
  assert.equal(reasons['Apple Pay Top-Up by *1234'], 'Top-up');
  assert.equal(reasons['To pocket EUR Weekend trips'], 'Savings / pocket movement');
  assert.equal(reasons['Deposit'], 'Savings / pocket movement');
  assert.equal(reasons['Tesco'], 'GBP account (only EUR is tracked)');
  assert.equal(reasons['UBER *TRIP'], 'Pending (not completed yet)');
  assert.equal(reasons['Fnac Bastille'], 'Declined');
  assert.equal(reasons['To Alex Example'], 'Transfer to your own account');
  assert.equal(reasons['From Partner'], 'Money in (not spending)');
  assert.equal(reasons['Exchanged to GBP'], 'Currency exchange between your accounts');
});

test('planned rent is linked, not added', () => {
  assert.equal(first.link[0].id, 'plan-rent-1');
  assert.match(first.link[0].fingerprint, /^revolut\|2026-10-03 12:00:00/);
});

test('fee is included in the cost', () => {
  assert.equal(byDesc('Hotel Roma Termini')[0].amount, 12120);
});

test('foreign merchant on the EUR account uses the EUR amount; quoted description survives', () => {
  const [pret] = byDesc('Pret A Manger, London');
  assert.equal(pret.amount, 780);
  assert.equal(pret.categoryId, 'eating');
});

test('rule default split is applied', () => {
  const [m] = byDesc('MONOPRIX PARIS 11');
  assert.deepEqual([m.categoryId, m.splitMode, m.myShare, m.counterpartId], ['groceries', 'shared', 1170, 'partner']);
});

test('identical rows in one file are both kept', () => {
  assert.equal(byDesc('Café Charlot').length, 2);
});

test('refund takes the category of the original purchase and nets against it', () => {
  const [buy, refund] = byDesc('ZARA').sort((a, b) => a.date.localeCompare(b.date));
  assert.equal(refund.kind, 'refund');
  assert.equal(refund.amount, -4999);
  assert.equal(refund.refundOf, buy.id);
  assert.equal(refund.categoryId, 'shopping');
  assert.equal(buy.myShare + refund.myShare, 0);
});

test('no rule match goes to the inbox (incl. transfers to other people)', () => {
  assert.equal(byDesc('Nuova Istanbul Kebab')[0].categoryId, null);
  assert.equal(byDesc('To Jordan Smith')[0].categoryId, null);
});

test('re-importing the same file adds nothing', () => {
  const stored = [...first.add, ...first.link];
  const again = planImport(csv, stored, rules, opts);
  assert.equal(again.summary.added, 0);
  assert.equal(again.summary.linked, 0);
  assert.equal(again.summary.duplicates, first.summary.added + first.summary.linked);
});
