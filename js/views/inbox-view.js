// Inbox: uncategorised expenses, one at a time. Tap a category → saved → next.

import { h, icon, pageHeader, backLink, emptyState, segmented, field, toast } from '../ui.js';
import { listTransactions, saveTransaction, updateMany } from '../transactions.js';
import { listCategories } from '../categories.js';
import { listPeople } from '../people.js';
import { settings } from '../settings.js';
import { upsertRuleForKeyword, matchRule, normalize } from '../rules.js';
import { computeSplit } from '../split.js';
import { money, dayHeading } from '../format.js';
import { openTransactionForm } from './tx-form.js';

const QUICK_SPLITS = [['mine', 'Mine'], ['shared', '50/50'], ['theirs', 'Theirs']];
let skipped = new Set();   // skipped this session; they stay in the inbox

function suggestKeyword(description) {
  return normalize(description).split(' ').filter((w) => w.length > 1 && !/^\d+$/.test(w)).slice(0, 2).join(' ');
}

export async function render(main) {
  const [all, categories, people] = await Promise.all([listTransactions(), listCategories(), listPeople()]);
  const inbox = all.filter((t) => !t.categoryId).reverse();       // oldest first
  const queue = inbox.filter((t) => !skipped.has(t.id));
  const s = settings();
  const partner = people.find((p) => p.id === s.defaultCounterpart)?.name ?? 'partner';

  main.append(backLink('#/transactions', 'Transactions'));

  if (!inbox.length) {
    skipped = new Set();
    main.append(pageHeader('Inbox'), h('div', { class: 'card' }, emptyState('check', 'All categorised', 'New imports without a matching rule will show up here.')));
    return;
  }
  if (!queue.length) {
    main.append(pageHeader('Inbox', `${inbox.length} skipped`),
      h('div', { class: 'card' }, emptyState('inbox', 'You skipped the rest', 'They stay here until you categorise them.'),
        h('div', { style: { textAlign: 'center' } }, h('button', { class: 'btn', type: 'button', onclick: () => { skipped = new Set(); window.dispatchEvent(new Event('datachange')); } }, 'Start again'))));
    return;
  }

  const t = queue[0];
  let mode = t.splitMode === 'custom' ? 'mine' : t.splitMode;
  const ruleOn = h('input', { type: 'checkbox' });
  const keyword = h('input', { class: 'input', type: 'text', autocapitalize: 'characters', value: suggestKeyword(t.description) });
  const kwField = h('div', { hidden: true }, field('inbox-kw', 'When the description contains', keyword));
  ruleOn.addEventListener('change', () => { kwField.hidden = !ruleOn.checked; });

  async function assign(categoryId) {
    const cat = categories.find((c) => c.id === categoryId);
    const before = { ...t };
    const saved = await saveTransaction({ ...t, categoryId, ...computeSplit({ amount: t.amount, mode, counterpartId: t.counterpartId ?? s.defaultCounterpart }) });
    let extra = 0;
    if (ruleOn.checked && normalize(keyword.value)) {
      const rule = await upsertRuleForKeyword(keyword.value.toUpperCase(), categoryId, mode === 'mine' ? null : mode);
      const more = (await listTransactions()).filter((x) => !x.categoryId && x.id !== t.id && matchRule(x.description, [rule]));
      if (more.length) await updateMany(more, { categoryId });
      extra = more.length;
    }
    toast(`${cat.emoji} ${cat.name}${extra ? ` · rule applied to ${extra} more` : ''}`, {
      action: 'Undo', onAction: () => saveTransaction(before),
    });
    return saved;
  }

  main.append(
    pageHeader('Inbox', `${queue.length} to categorise`),
    h('section', { class: 'card stack inbox-card', 'aria-label': 'Expense to categorise' },
      h('p', { class: 'label' }, dayHeading(t.date), t.source === 'revolut' ? ' · Revolut' : ''),
      h('p', { class: 'inbox-card__desc' }, t.description || 'No description'),
      h('p', { class: 'big-number' }, money(t.amount)),
      h('div', { class: 'field' }, h('span', { class: 'label' }, `Split with ${partner}`),
        segmented('inbox-split', 'Split', QUICK_SPLITS, QUICK_SPLITS.some(([v]) => v === mode) ? mode : 'mine', (v) => { mode = v; })),
      h('label', { class: 'check' }, ruleOn, h('span', {}, 'Always categorise like this')),
      kwField,
      h('div', { class: 'cat-grid', role: 'group', 'aria-label': 'Choose a category' },
        categories.map((c) => h('button', {
          class: 'cat-chip__body cat-btn', type: 'button', style: { '--dot': c.color }, 'data-key': `inbox-cat-${c.id}`,
          onclick: () => assign(c.id),
        }, h('span', { 'aria-hidden': 'true' }, c.emoji), h('span', { class: 'cat-chip__name' }, c.name))),
      ),
      h('div', { class: 'inbox-card__actions' },
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { skipped.add(t.id); window.dispatchEvent(new Event('datachange')); } }, 'Skip'),
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => openTransactionForm({ tx: t }) }, 'Edit details'),
      ),
    ),
  );
}
