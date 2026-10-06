// Budget maths: spreading costs over time, monthly totals, projections.
// Pure functions; amounts are integer cents.
//
// - A transaction with `spread` is divided evenly over the days it covers, so
//   rent paid in one go shows up as a steady cost in every month it covers.
// - Settlements are never spending.
// - view 'mine' uses my share (default); 'total' uses the full amount paid.

import { isSettlement } from './balance.js';

const DAY = 86_400_000;
export const dayNum = (iso) => Math.round(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY);
export const isoOf = (n) => new Date(n * DAY).toISOString().slice(0, 10);
const monthEnd = (ym) => { const [y, m] = ym.split('-').map(Number); return Date.UTC(y, m, 0) / DAY; };   // day 0 of next month = last day
const monthStart = (ym) => dayNum(`${ym}-01`);
export const daysInMonth = (ym) => monthEnd(ym) - monthStart(ym) + 1;

const value = (t, view) => (view === 'total' ? t.amount : t.myShare);

/**
 * Split a transaction into day ranges with the cents that fall in each.
 * Returns [{ month, from, to, cents }]; rounding is cumulative so parts add up exactly.
 */
export function portions(t, view = 'mine') {
  const v = value(t, view);
  if (!t.spread) {
    const d = dayNum(t.date);
    return [{ month: t.date.slice(0, 7), from: d, to: d, cents: v }];
  }
  const a = dayNum(t.spread.from), b = dayNum(t.spread.to);
  const days = b - a + 1;
  const out = [];
  let start = a, done = 0, given = 0;
  while (start <= b) {
    const ym = isoOf(start).slice(0, 7);
    const end = Math.min(monthEnd(ym), b);
    done += end - start + 1;
    const upTo = Math.round((v * done) / days);
    out.push({ month: ym, from: start, to: end, cents: upTo - given });
    given = upTo;
    start = end + 1;
  }
  return out;
}

/** Cents of a transaction that fall inside [fromDay, toDay] (day numbers). */
export function amountBetween(t, fromDay, toDay, view = 'mine') {
  let sum = 0;
  for (const p of portions(t, view)) {
    const lo = Math.max(p.from, fromDay), hi = Math.min(p.to, toDay);
    if (lo > hi) continue;
    sum += Math.round((p.cents * (hi - lo + 1)) / (p.to - p.from + 1));
  }
  return sum;
}

const spending = (txs) => txs.filter((t) => !isSettlement(t));

/** { 'YYYY-MM': { categoryId|'none': cents } } across all spending. */
export function monthCategoryTotals(txs, view = 'mine') {
  const out = {};
  for (const t of spending(txs)) {
    for (const p of portions(t, view)) {
      const m = (out[p.month] ??= {});
      const k = t.categoryId ?? 'none';
      m[k] = (m[k] ?? 0) + p.cents;
    }
  }
  return out;
}

/** Days of `ym` that fall within the exchange period. */
export function periodDaysInMonth(ym, period) {
  const lo = Math.max(monthStart(ym), dayNum(period.start));
  const hi = Math.min(monthEnd(ym), dayNum(period.end));
  return Math.max(0, hi - lo + 1);
}

/** A category's budget for a month, pro-rated when the exchange covers only part of it. */
export function budgetFor(cat, ym, period) {
  if (!cat.budget) return 0;
  return Math.round((cat.budget * periodDaysInMonth(ym, period)) / daysInMonth(ym));
}

/** Cents of one category's spending within the exchange part of a month. */
function actualInMonth(txs, categoryId, ym, period, view) {
  const lo = Math.max(monthStart(ym), dayNum(period.start)), hi = Math.min(monthEnd(ym), dayNum(period.end));
  if (lo > hi) return 0;
  return txs.filter((t) => t.categoryId === categoryId && !isSettlement(t)).reduce((s, t) => s + amountBetween(t, lo, hi, view), 0);
}

/**
 * The budget a category is measured against in a month.
 * A Fixed category without a budget (e.g. rent) is "budgeted at what it
 * costs", so known fixed costs don't make every month look over budget.
 * Returns { cents, implicit }.
 */
export function effectiveBudget(cat, ym, period, txs, view = 'mine') {
  if (cat.budget > 0) return { cents: budgetFor(cat, ym, period), implicit: false };
  if (cat.type === 'fixed') return { cents: actualInMonth(txs, cat.id, ym, period, view), implicit: true };
  return { cents: 0, implicit: false };
}

/**
 * Everything the Overview needs.
 * period = { start, end } (ISO dates); today = ISO date.
 */
export function overview(txs, categories, period, today, view = 'mine') {
  const startD = dayNum(period.start), endD = dayNum(period.end), todayD = dayNum(today);
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const active = categories.filter((c) => !c.archived);
  const spend = spending(txs);

  // Month in focus: the current month, kept inside the exchange period.
  const clampedD = Math.min(Math.max(todayD, startD), endD);
  const month = isoOf(clampedD).slice(0, 7);
  const mStart = Math.max(monthStart(month), startD), mEnd = Math.min(monthEnd(month), endD);

  const byCat = {};
  for (const t of spend) {
    const c = amountBetween(t, mStart, mEnd, view);
    if (c) byCat[t.categoryId ?? 'none'] = (byCat[t.categoryId ?? 'none'] ?? 0) + c;
  }
  const monthSpent = Object.values(byCat).reduce((a, b) => a + b, 0);
  const eff = (c, m) => effectiveBudget(c, m, period, spend, view);
  const monthBudget = active.reduce((s, c) => s + eff(c, month).cents, 0);
  const daysLeft = Math.max(0, mEnd - Math.max(todayD, mStart) + 1);
  const left = monthBudget - monthSpent;

  const top = Object.entries(byCat)
    .filter(([id]) => id !== 'none' && catById[id])
    .map(([id, spent]) => { const b = eff(catById[id], month); return { category: catById[id], spent, budget: b.cents, implicitBudget: b.implicit }; })
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 3);

  // Whole exchange.
  const toDateD = Math.min(todayD, endD);
  const spentToDate = spend.reduce((s, t) => s + amountBetween(t, startD, toDateD, view), 0);
  const committed = spend.reduce((s, t) => s + amountBetween(t, startD, endD, view), 0);
  const elapsed = Math.max(0, toDateD - startD + 1);
  const remaining = Math.max(0, endD - Math.max(todayD, startD - 1));
  const isVariableDaily = (t) => !t.spread && (catById[t.categoryId]?.type ?? 'variable') !== 'fixed';
  const variableToDate = spend.filter(isVariableDaily).reduce((s, t) => s + amountBetween(t, startD, toDateD, view), 0);
  const avgDailyVariable = elapsed ? Math.round(variableToDate / elapsed) : 0;
  const projected = committed + avgDailyVariable * remaining;

  const months = [];
  for (let d = startD; d <= endD; d = monthEnd(isoOf(d).slice(0, 7)) + 1) months.push(isoOf(d).slice(0, 7));
  const plan = months.reduce((s, m) => s + active.reduce((s2, c) => s2 + eff(c, m).cents, 0), 0);

  return {
    month, monthSpent, monthBudget, left, daysLeft,
    perDay: daysLeft ? Math.floor(left / daysLeft) : 0,
    top, uncategorizedThisMonth: byCat.none ?? 0,
    spentToDate, committed, projected, plan, gap: projected - plan,
    avgDailyVariable, elapsed, remaining, started: todayD >= startD,
    reliable: elapsed >= 7,              // a week of data before projecting variable spend
    hasBudgets: active.some((c) => c.budget > 0),
    months,
  };
}
