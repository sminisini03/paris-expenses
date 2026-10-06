import { h, pageHeader, emptyState } from '../ui.js';
import { settings } from '../settings.js';
import { date, money } from '../format.js';

const DAY = 86_400_000;
const dayNumber = (iso) => Math.floor(Date.parse(iso + 'T00:00:00Z') / DAY);
const todayIso = () => new Date().toLocaleDateString('sv-SE'); // local YYYY-MM-DD

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

export function render(main) {
  const s = settings();
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
    h('div', { class: 'card', style: { marginTop: 'var(--s-2)' } },
      emptyState('inbox', 'No expenses yet', 'Quick add and Revolut import arrive in the next steps.'),
    ),
  );
}
