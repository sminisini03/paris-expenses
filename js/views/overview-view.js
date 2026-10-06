import { h, pageHeader, emptyState } from '../ui.js';
import { settings } from '../settings.js';
import { date, money, todayIso } from '../format.js';
import { listTransactions } from '../transactions.js';
import { listPeople, ME } from '../people.js';
import { allBalances } from '../balance.js';
import { balanceText } from './balance-view.js';

const DAY = 86_400_000;
const dayNumber = (iso) => Math.floor(Date.parse(iso + 'T00:00:00Z') / DAY);

function periodStatus({ periodStart, periodEnd }) {
  const total = dayNumber(periodEnd) - dayNumber(periodStart) + 1;
  const today = dayNumber(todayIso());
  if (today < dayNumber(periodStart)) {
    const d = dayNumber(periodStart) - today;
    return `Starts ${d === 1 ? 'tomorrow' : `in ${d} days`} · ${total} days`;
  }
  if (today > dayNumber(periodEnd)) return `Ended · ${total} days`;
  return `Day ${today - dayNumber(periodStart) + 1} of ${total}`;
}

export async function render(main) {
  const s = settings();
  const [txs, people] = await Promise.all([listTransactions(), listPeople()]);
  const balances = allBalances(txs);
  const others = people.filter((p) => p.id !== ME && balances[p.id]);
  main.append(
    pageHeader('Overview', `${date(s.periodStart)} – ${date(s.periodEnd)} · ${periodStatus(s)}`),
    h('div', { class: 'grid-2' },
      h('section', { class: 'card stack', 'aria-labelledby': 'ov-month' },
        h('h2', { class: 'label', id: 'ov-month' }, 'Spent this month'),
        h('p', { class: 'big-number' }, money(0)),
        h('div', { class: 'bar', role: 'presentation' }, h('span', { style: { '--pct': '0%' } })),
        h('p', { class: 'small muted' }, 'Budgets are set per category in Settings.'),
      ),
      h('section', { class: 'card stack', 'aria-labelledby': 'ov-total' },
        h('h2', { class: 'label', id: 'ov-total' }, 'Whole exchange'),
        h('p', { class: 'big-number' }, money(0)),
        h('p', { class: 'small muted' }, 'Projection appears once there is spending to average.'),
      ),
    ),
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
