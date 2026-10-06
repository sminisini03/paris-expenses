// Transactions: search, filters (kept in the URL so charts can deep-link
// here), day-grouped list, tap to edit, select to recategorise in bulk.

import { h, icon, pageHeader, emptyState, openDialog, toast } from '../ui.js';
import { listTransactions, filterTransactions, updateMany, isScheduled, INBOX, inInbox } from '../transactions.js';
import { listCategories } from '../categories.js';
import { listPeople, ME } from '../people.js';
import { settings } from '../settings.js';
import { money, month as monthName, monthsBetween, dayHeading, todayIso } from '../format.js';
import { sharePct } from '../split.js';
import { openTransactionForm } from './tx-form.js';
import { pickAndImport } from './import-flow.js';
import { openSettleUp } from './balance-view.js';
import { isSettlement } from '../balance.js';

function splitText(t, names) {
  const who = names[t.counterpartId] ?? 'someone';
  if (t.iPaid === 0 && t.amount !== 0) return `Paid by ${who}`;
  switch (t.splitMode) {
    case 'shared': return `50/50 with ${who}`;
    case 'custom': return `${sharePct(t)}% mine · ${who}`;
    case 'theirs': return `${who}'s · owes you`;
    default: return '';
  }
}

function select(labelText, name, value, options) {
  const id = `f-${name}`;
  return h('div', { class: 'field' },
    h('label', { class: 'label visually-hidden', for: id }, labelText),
    h('select', { class: 'select select--sm', id, name, 'data-key': id },
      options.map(([v, t]) => h('option', { value: v, selected: v === (value ?? '') }, t))),
  );
}

export async function render(main, params = {}) {
  const [all, categories, people] = await Promise.all([
    listTransactions(), listCategories({ includeArchived: true }), listPeople(),
  ]);
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const names = Object.fromEntries(people.map((p) => [p.id, p.name]));
  const s = settings();
  const today = todayIso();

  const f = { q: params.q ?? '', month: params.month ?? '', cat: params.cat ?? '', split: params.split ?? '', person: params.person ?? '' };
  const selected = new Set();
  let selecting = false;

  // --- Filters ---------------------------------------------------------------
  const months = monthsBetween(s.periodStart, s.periodEnd);
  const filters = h('div', { class: 'filters' },
    select('Month', 'month', f.month, [['', 'All months'], ...months.map((m) => [m, monthName(m)])]),
    select('Category', 'cat', f.cat, [['', 'All categories'], [INBOX, 'Inbox (uncategorised)'], ...categories.map((c) => [c.id, `${c.emoji} ${c.name}${c.archived ? ' (archived)' : ''}`])]),
    select('Split', 'split', f.split, [['', 'Any split'], ['mine', 'Mine'], ['shared', '50/50'], ['custom', 'Custom'], ['theirs', 'Theirs']]),
    select('Person', 'person', f.person, [['', 'Anyone'], ...people.filter((p) => p.id !== ME).map((p) => [p.id, `With ${p.name}`])]),
  );
  filters.addEventListener('change', (e) => { f[e.target.name] = e.target.value; draw(); });

  const search = h('input', {
    class: 'input', type: 'search', placeholder: 'Search description, note, category', value: f.q,
    'aria-label': 'Search transactions', 'data-key': 'tx-search',
    oninput: (e) => { f.q = e.target.value; draw(); },
  });

  const summary = h('p', { class: 'page-subtitle', 'aria-live': 'polite' });
  const inboxChip = h('a', { class: 'chip', href: '#/inbox' });
  const listHost = h('div', { class: 'stack' });

  const selectBtn = h('button', { class: 'btn', type: 'button', 'data-key': 'tx-select', onclick: () => { selecting = !selecting; selected.clear(); draw(); } });
  const bulkBar = h('div', { class: 'bulk-bar', role: 'region', 'aria-label': 'Bulk actions' },
    h('span', { class: 'bulk-bar__count', 'aria-live': 'polite' }),
    h('button', { class: 'btn', type: 'button', onclick: () => { selecting = false; selected.clear(); draw(); } }, 'Cancel'),
    h('button', { class: 'btn btn--primary', type: 'button', onclick: () => bulkRecategorise() }, 'Set category'),
  );

  function bulkRecategorise() {
    if (!selected.size) { toast('Select some transactions first.'); return; }
    const txs = all.filter((t) => selected.has(t.id));
    const choice = h('select', { class: 'select', id: 'bulk-cat' },
      categories.filter((c) => !c.archived).map((c) => h('option', { value: c.id }, `${c.emoji} ${c.name}`)),
      h('option', { value: '' }, 'Inbox (uncategorised)'));
    openDialog({
      title: `Recategorise ${txs.length}`,
      content: h('div', { class: 'field' }, h('label', { class: 'label', for: 'bulk-cat' }, 'Move to'), choice),
      actions: [{ label: 'Cancel' }, { label: 'Apply', variant: 'primary', onClick: async () => {
        await updateMany(txs, { categoryId: choice.value || null });
        toast(`${txs.length} transaction${txs.length === 1 ? '' : 's'} updated.`);
      } }],
    });
  }

  // --- Rows ----------------------------------------------------------------
  function settlementRow(t) {
    const who = names[t.counterpartId] ?? 'someone';
    const person = people.find((p) => p.id === t.counterpartId) ?? { id: t.counterpartId, name: who };
    return h('li', {}, h('button', { class: 'row row__btn tx-row', type: 'button', 'data-key': `tx-${t.id}`, onclick: () => openSettleUp({ person, tx: t }) },
      h('span', { class: 'cat-icon', 'aria-hidden': 'true' }, '⇄'),
      h('span', { class: 'row__main' },
        h('span', { class: 'row__title', style: { display: 'block' } }, t.iPaid < 0 ? `${who} paid you` : `You paid ${who}`),
        h('span', { class: 'row__hint', style: { display: 'block' } }, 'Settle up · not spending'),
      ),
      h('span', { class: 'row__amount amount muted' }, money(t.amount)),
    ));
  }

  function row(t) {
    if (isSettlement(t) && !selecting) return settlementRow(t);
    const c = catById[t.categoryId];
    const split = splitText(t, names);
    const badges = [
      isScheduled(t, today) && h('span', { class: 'badge' }, 'Scheduled'),
      t.spread && h('span', { class: 'badge' }, 'Spread'),
      t.amount < 0 && h('span', { class: 'badge' }, 'Refund'),
    ].filter(Boolean);
    const body = [
      h('span', { class: 'cat-icon', style: c ? { '--dot': c.color } : {}, 'aria-hidden': 'true' }, c?.emoji ?? '?'),
      h('span', { class: 'row__main' },
        h('span', { class: 'row__title', style: { display: 'block' } }, t.description || c?.name || 'Expense'),
        h('span', { class: 'row__hint', style: { display: 'block' } },
          [c ? c.name : 'Uncategorised', split].filter(Boolean).join(' · '), ...badges.map((b) => [' ', b])),
      ),
      h('span', { class: 'row__amount' },
        h('span', { class: 'amount' }, money(t.myShare)),
        t.myShare !== t.amount && h('span', { class: 'amount row__hint', style: { display: 'block' } }, `of ${money(t.amount)}`),
      ),
    ];
    if (selecting) {
      const cb = h('input', { type: 'checkbox', checked: selected.has(t.id), 'aria-label': `Select ${t.description || 'expense'} ${money(t.amount)}`,
        onchange: (e) => { e.target.checked ? selected.add(t.id) : selected.delete(t.id); updateBulk(); } });
      return h('li', {}, h('label', { class: 'row row--select' }, cb, ...body));
    }
    return h('li', {}, h('button', { class: 'row row__btn tx-row', type: 'button', 'data-key': `tx-${t.id}`, onclick: () => openTransactionForm({ tx: t }) }, ...body));
  }

  function updateBulk() {
    bulkBar.querySelector('.bulk-bar__count').textContent = `${selected.size} selected`;
  }

  function draw() {
    // Keep the URL in sync without adding history entries or re-rendering.
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
    history.replaceState(null, '', `#/transactions${q ? `?${q}` : ''}`);

    const shown = filterTransactions(all, f, catById);
    const mine = shown.reduce((sum, t) => sum + t.myShare, 0);
    summary.textContent = `${shown.length} transaction${shown.length === 1 ? '' : 's'} · ${money(mine)} my share`;

    const inboxCount = all.filter(inInbox).length;
    inboxChip.hidden = !inboxCount || f.cat === INBOX;
    inboxChip.replaceChildren(icon('inbox'), `${inboxCount} to categorise`);

    selectBtn.textContent = selecting ? 'Done' : 'Select';
    selectBtn.hidden = all.length === 0;
    bulkBar.hidden = !selecting;
    document.body.classList.toggle('is-selecting', selecting);   // hides the + button
    updateBulk();

    if (!all.length) {
      listHost.replaceChildren(h('div', { class: 'card' }, emptyState('transactions', 'No transactions yet', 'Tap + to add an expense, or Import CSV for a Revolut statement.')));
      return;
    }
    if (!shown.length) {
      listHost.replaceChildren(h('div', { class: 'card' }, emptyState('search', 'Nothing matches', 'Try another search or clear the filters.'),
        h('div', { style: { textAlign: 'center' } }, h('a', { class: 'btn btn--ghost', href: '#/transactions' }, 'Clear filters'))));
      return;
    }
    const byDay = new Map();
    for (const t of shown) (byDay.get(t.date) ?? byDay.set(t.date, []).get(t.date)).push(t);
    listHost.replaceChildren(...[...byDay].map(([day, txs]) => h('section', { 'aria-label': dayHeading(day) },
      h('h2', { class: 'day-heading' },
        h('span', {}, dayHeading(day), day > today ? ' · scheduled' : ''),
        h('span', { class: 'amount' }, money(txs.reduce((sum, t) => sum + t.myShare, 0)))),
      h('ul', { class: 'list' }, txs.map(row)),
    )));
  }

  draw();
  main.append(
    h('header', { class: 'page-header' },
      h('div', {}, h('h1', { class: 'page-title', tabindex: '-1' }, 'Transactions'), summary),
      h('div', { class: 'header-actions' },
        h('button', { class: 'btn', type: 'button', 'data-key': 'tx-import', onclick: pickAndImport }, 'Import CSV'),
        selectBtn,
      ),
    ),
    inboxChip,
    h('div', { class: 'stack', style: { marginBottom: 'var(--s-2)' } }, search, filters),
    listHost,
    bulkBar,
  );
}
