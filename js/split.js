// Who paid, and how much of it is mine. Every transaction stores two numbers
// in cents, iPaid and myShare; the split "modes" are just presets for them.
// What the counterpart owes me = iPaid − myShare (negative: I owe them).

import { ME } from './people.js';

export const SPLIT_MODES = [
  ['mine', 'Mine'],
  ['shared', '50/50'],
  ['custom', 'Custom'],
  ['theirs', 'Theirs'],
];

/**
 * amount: total cents (negative for refunds)
 * mode: 'mine' | 'shared' | 'custom' | 'theirs'
 * customShare: my share in cents (custom mode only)
 * paidBy: ME or a person id
 */
export function computeSplit({ amount, mode = 'mine', customShare = 0, paidBy = ME, counterpartId = null }) {
  const myShare = {
    mine: amount,
    shared: Math.round(amount / 2),
    custom: customShare,
    theirs: 0,
  }[mode] ?? amount;
  const iPaid = paidBy === ME ? amount : 0;
  // A counterpart is only involved if money is owed one way or the other.
  const involved = mode !== 'mine' || paidBy !== ME;
  return {
    splitMode: mode,
    myShare,
    iPaid,
    counterpartId: involved ? (paidBy !== ME ? paidBy : counterpartId) : null,
  };
}

/** Positive: the counterpart owes me. Negative: I owe them. */
export const owedToMe = (tx) => (tx.iPaid ?? 0) - (tx.myShare ?? 0);

/** My share as a percentage of the total (for showing custom splits). */
export function sharePct(tx) {
  if (!tx.amount) return 0;
  return Math.round((tx.myShare / tx.amount) * 1000) / 10;
}

/** Split a total across several parts proportionally, so the parts add up exactly. */
export function proportional(parts, total) {
  const sum = parts.reduce((a, b) => a + b, 0);
  const out = parts.map((p) => Math.round((p * total) / sum));
  out[out.length - 1] += total - out.reduce((a, b) => a + b, 0);
  return out;
}
