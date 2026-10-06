// Running balance with each person you split with.
// Positive = they owe me, negative = I owe them. Only payments up to today
// count; future (scheduled) ones are reported separately as "upcoming".
//
// A settlement is a transaction of kind 'settlement' that moves money between
// people without being spending: myShare = 0, and iPaid = −X when they paid me
// X (or +X when I paid them X), so it cancels out exactly that much debt.

import { owedToMe } from './split.js';
import { todayIso } from './format.js';

export const isSettlement = (t) => t.kind === 'settlement';

/** Fields for a settlement: `theyPaidMe` true when the counterpart paid me. */
export function settlementFields({ amount, personId, theyPaidMe }) {
  return {
    kind: 'settlement',
    amount,
    myShare: 0,
    iPaid: theyPaidMe ? -amount : amount,
    splitMode: 'settlement',
    counterpartId: personId,
    categoryId: null,
    spread: null,
  };
}

export function balanceWith(txs, personId, today = todayIso()) {
  let now = 0, upcoming = 0;
  const items = [];
  for (const t of txs) {
    if (t.counterpartId !== personId) continue;
    const owed = owedToMe(t);
    if (!owed) continue;
    if (t.date > today) upcoming += owed;
    else { now += owed; items.push({ t, owed }); }
  }
  items.sort((a, b) => b.t.date.localeCompare(a.t.date));
  return { now, upcoming, items };
}

/** Balances for every counterpart that appears in the data. */
export function allBalances(txs, today = todayIso()) {
  const ids = [...new Set(txs.map((t) => t.counterpartId).filter(Boolean))];
  return Object.fromEntries(ids.map((id) => [id, balanceWith(txs, id, today)]));
}
