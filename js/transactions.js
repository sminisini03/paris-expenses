// Transactions: storage plus pure filtering helpers.
// Amounts are integer cents; positive = money spent, negative = refund.

import * as db from './db.js';
import { normalize } from './rules.js';
import { todayIso } from './format.js';

export const INBOX = 'inbox';   // filter value for "no category"

/** Waiting for a category. Settlements never need one. */
export const inInbox = (t) => !t.categoryId && t.kind !== 'settlement';

export function newTransaction(fields = {}) {
  const now = new Date().toISOString();
  return {
    id: db.uid(),
    source: 'manual',          // manual | plan | revolut | (sync, later)
    externalId: null,          // provider id, for phase-2 bank sync
    fingerprint: null,         // import de-duplication
    importBatchId: null,
    kind: 'expense',           // expense | refund | settlement
    date: todayIso(),
    description: '',
    note: '',
    amount: 0,
    fee: 0,
    origAmount: null,
    origCurrency: null,
    categoryId: null,
    splitMode: 'mine',
    myShare: 0,
    iPaid: 0,
    counterpartId: null,
    spread: null,              // { from, to } to spread the cost over a period
    refundOf: null,
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
}

export async function listTransactions() {
  const all = await db.getAll('transactions');
  return all.sort((a, b) => (b.date + (b.time ?? '')).localeCompare(a.date + (a.time ?? '')) || b.createdAt.localeCompare(a.createdAt));
}

export async function saveTransaction(tx) {
  const value = { ...tx, updatedAt: new Date().toISOString() };
  await db.put('transactions', value);
  db.emitDataChange();
  return value;
}

export async function deleteTransaction(id) {
  await db.del('transactions', id);
  db.emitDataChange();
}

export async function updateMany(txs, patch) {
  const now = new Date().toISOString();
  await db.batch({ transactions: { put: txs.map((t) => ({ ...t, ...patch, updatedAt: now })) } });
  db.emitDataChange();
}

/** Dated in the future, e.g. a rent instalment not yet due. */
export const isScheduled = (tx, today = todayIso()) => tx.date > today;

/**
 * Pure filter. f = { q, month: 'YYYY-MM', cat: id | 'inbox', split: mode, person: id }
 * Month filters on the payment date (spreading only affects charts/budgets).
 */
export function filterTransactions(txs, f = {}, categoriesById = {}) {
  const q = normalize(f.q);
  return txs.filter((t) => {
    if (f.month && !t.date.startsWith(f.month)) return false;
    if (f.cat === INBOX ? !inInbox(t) : f.cat && t.categoryId !== f.cat) return false;
    if (f.split && t.splitMode !== f.split) return false;
    if (f.person && t.counterpartId !== f.person) return false;
    if (q) {
      const hay = normalize(`${t.description} ${t.note} ${categoriesById[t.categoryId]?.name ?? ''}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
