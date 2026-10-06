// Overview: this month vs budget, the whole exchange vs plan, top categories,
// balances. All amounts follow the "My share / Total" switch.

import { h, icon, pageHeader, emptyState, segmented, toast } from '../ui.js';
import { settings, setSetting } from '../settings.js';
import { date, money, month as monthName, todayIso } from '../format.js';
import { listTransactions, inInbox } from '../transactions.js';
import { listCategories } from '../categories.js';
import { listPeople, ME } from '../people.js';
import { allBalances } from '../balance.js';
import { overview, dayNum } from '../budget.js';
import { balanceText } from './balance-view.js';
import { lastBackupAt, downloadBackup } from '../export.js';

function periodStatus({ periodStart, periodEnd }, today) {
  const total = dayNum(periodEnd) - dayNum(periodStart) + 1;
  const t = dayNum(today);
  if (t < dayNum(periodStart)) {
    const d = dayNum(periodStart) - t;
    return `Starts ${d === 1 ? 'tomorrow' : `in ${d} days`} · ${total} days`;
  }
  if (t > dayNum(periodEnd)) return `Ended · ${total} days`;
  return `Day ${t - dayNum(periodStart) + 1} of ${total}`;
}

const pct = (part, whole) => (whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0);

function budgetBar(spent, budget, color) {
  const over = budget > 0 && spent > budget;
  return h('div', { class: `bar${over ? ' bar--over' : ''}`, role: 'img', 'aria-label': budget ? `${pct(spent, budget)}% of budget used` : 'No budget' },
    h('span', { style: { '--pct': `${budget ? pct(spent, budget) : 0}%`, ...(color && !over ? { '--bar-color': color } : {}) } }));
}

function statRow(label, value, tone) {
  return h('div', { class: 'stat-row' }, h('dt', { class: 'muted' }, label), h('dd', { class: `amount${tone ? ` tone-${tone}` : ''}` }, value));
}

const SNOOZE_KEY = 'pe.backupSnoozedUntil';
const BACKUP_EVERY_DAYS = 7;

/** "Back up" reminder: iOS can clear a web app's storage, and a backup is the only copy. */
async function backupBanner(txCount) {
  if (!txCount) return null;
  const last = await lastBackupAt();
  const ageDays = last ? Math.floor((Date.now() - Date.parse(last)) / 86_400_000) : Infinity;
  if (ageDays < BACKUP_EVERY_DAYS) return null;
  try { if (Number(localStorage.getItem(SNOOZE_KEY)) > Date.now()) return null; } catch { /* storage blocked: just show it */ }
  const el = h('section', { class: 'banner', role: 'region', 'aria-label': 'Backup reminder' },
    h('p', { class: 'small' }, h('strong', {}, last ? `Last backup ${ageDays} days ago.` : 'No backup yet.'),
      ' iOS can clear app data, and nothing is stored anywhere else. Save a backup to Files.'),
    h('div', { class: 'banner__actions' },
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => {
        try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + 86_400_000)); } catch { /* ignore */ }
        el.remove();
      } }, 'Later'),
      h('button', { class: 'btn btn--primary', type: 'button', 'data-key': 'banner-backup', onclick: async () => {
        if (await downloadBackup()) { toast('Backup saved.'); el.remove(); }
      } }, 'Back up now'),
    ),
  );
  return el;
}

export async function render(main) {
  const s = settings();
  const today = todayIso();
  const [txs, categories, people] = await Promise.all([listTransactions(), listCategories(), listPeople()]);
  const view = s.amountView;
  const o = overview(txs, categories, { start: s.periodStart, end: s.periodEnd }, today, view);
  const balances = allBalances(txs);
  const others = people.filter((p) => p.id !== ME && balances[p.id]);
  const inboxCount = txs.filter(inInbox).length;
  const banner = await backupBanner(txs.length);
  const mName = monthName(o.month);
  const endLabel = date(s.periodEnd).replace(/ \d{4}$/, '');
  // Budgets are for your share; in the Total view they would compare apples with oranges.
  const showBudgets = o.hasBudgets && view === 'mine';

  // --- This month -----------------------------------------------------------
  const monthCard = h('section', { class: 'card stack', 'aria-labelledby': 'ov-month' },
    h('h2', { class: 'label', id: 'ov-month' }, mName),
    h('p', { class: 'big-number' }, money(o.monthSpent)),
    showBudgets
      ? [
        budgetBar(o.monthSpent, o.monthBudget),
        h('p', { class: 'small' }, o.left >= 0
          ? [h('span', { class: 'amount' }, money(o.left)), ` left of ${money(o.monthBudget)}`]
          : [h('span', { class: 'amount tone-negative' }, money(-o.left)), ` over the ${money(o.monthBudget)} budget`]),
        o.left > 0 && o.daysLeft > 0 && h('p', { class: 'small muted' },
          h('span', { class: 'amount' }, money(o.perDay)), ` a day for the ${o.daysLeft === 1 ? 'last day' : `next ${o.daysLeft} days`}`),
      ]
      : view === 'total'
        ? h('p', { class: 'small muted' }, 'Full amounts paid, including other people’s shares. Budgets are compared in the My share view.')
        : h('p', { class: 'small muted' }, 'No budgets yet. ', h('a', { href: '#/settings?section=categories' }, 'Set monthly budgets →')),
  );

  // --- Whole exchange ---------------------------------------------------------
  const gapTone = o.gap > 0 ? 'negative' : 'positive';
  const exchangeCard = h('section', { class: 'card stack', 'aria-labelledby': 'ov-total' },
    h('h2', { class: 'label', id: 'ov-total' }, 'Whole exchange · spent so far'),
    h('p', { class: 'big-number' }, money(o.spentToDate)),
    h('dl', { class: 'stats' },
      o.reliable
        ? statRow(`Projected by ${endLabel}`, money(o.projected))
        : statRow('Known costs so far', money(o.committed)),
      showBudgets && statRow('Plan (your budgets)', money(o.plan)),
      showBudgets && o.reliable && statRow(o.gap > 0 ? 'Over plan' : 'Under plan', money(Math.abs(o.gap)), gapTone),
    ),
    h('p', { class: 'small muted' }, o.reliable
      ? `Known costs plus your average of ${money(o.avgDailyVariable)} a day on variable spending for the ${o.remaining} days left.`
      : `Costs already entered (rent, flights…). The projection to ${endLabel} starts after a week of spending${o.started ? ` (${7 - o.elapsed} more day${7 - o.elapsed === 1 ? '' : 's'})` : ''}.`),
  );

  // --- Top categories ---------------------------------------------------------
  const topCard = o.top.length > 0 && h('section', { class: 'card stack', 'aria-labelledby': 'ov-top' },
    h('div', { class: 'card-head' },
      h('h2', { class: 'label', id: 'ov-top' }, `Top categories · ${mName}`),
      h('a', { class: 'small', href: '#/charts' }, 'All charts →')),
    h('ul', { class: 'top-list' }, o.top.map(({ category: c, spent, budget, implicitBudget }) => h('li', {},
      h('a', { class: 'top-row', href: `#/transactions?cat=${c.id}&month=${o.month}`, 'data-key': `ov-top-${c.id}` },
        h('span', { class: 'cat-icon', style: { '--dot': c.color }, 'aria-hidden': 'true' }, c.emoji),
        h('span', { class: 'top-row__main' },
          h('span', { class: 'top-row__line' },
            h('span', {}, c.name),
            h('span', { class: 'amount small' }, money(spent), budget && !implicitBudget && view === 'mine' ? h('span', { class: 'muted' }, ` / ${money(budget)}`) : '')),
          implicitBudget ? h('span', { class: 'small muted' }, 'Fixed cost · counted as planned')
            : budget && view === 'mine' ? budgetBar(spent, budget, c.color)
              : h('span', { class: 'small muted' }, view === 'mine' ? 'No budget' : 'Total paid'),
        ),
      )))),
  );

  main.append(
    pageHeader('Overview', `${date(s.periodStart)} – ${date(s.periodEnd)} · ${periodStatus(s, today)}`,
      segmented('amount-view', 'Amounts shown', [['mine', 'My share'], ['total', 'Total']], view, (v) => setSetting('amountView', v))),
    ...(banner ? [banner] : []),
    ...(inboxCount ? [h('a', { class: 'chip', href: '#/inbox' }, icon('inbox'), `${inboxCount} to categorise`)] : []),
    h('div', { class: 'grid-2' }, monthCard, exchangeCard),
    ...(topCard ? [h('div', { style: { marginTop: 'var(--s-2)' } }, topCard)] : []),
    ...others.map((p) => {
      const b = balances[p.id];
      return h('a', { class: 'card stack card--link', href: `#/balance?person=${p.id}`, style: { marginTop: 'var(--s-2)' }, 'data-key': `ov-bal-${p.id}` },
        h('span', { class: 'label' }, balanceText(b.now, p.name)),
        h('span', { class: 'big-number' }, money(Math.abs(b.now))),
        h('span', { class: 'small muted' }, b.upcoming ? `+ ${money(Math.abs(b.upcoming))} scheduled · ` : '', 'Settle up →'),
      );
    }),
    ...(txs.length ? [] : [h('div', { class: 'card', style: { marginTop: 'var(--s-2)' } },
      emptyState('inbox', 'No expenses yet', 'Tap + to add one, or import a Revolut CSV from Transactions.'))]),
  );
}
