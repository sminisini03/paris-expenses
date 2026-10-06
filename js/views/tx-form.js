// Quick add (amount → category → save) and the full transaction editor.
// One form; quick mode folds the optional fields under "More details".

import { h, field, segmented, openDialog, confirmDialog, fieldError, toast } from '../ui.js';
import { listCategories } from '../categories.js';
import { listPeople, ME } from '../people.js';
import { settings } from '../settings.js';
import { parseAmount, centsToInput, money } from '../format.js';
import { computeSplit, SPLIT_MODES } from '../split.js';
import { newTransaction, saveTransaction, deleteTransaction, listTransactions, updateMany, inInbox } from '../transactions.js';
import { upsertRuleForKeyword, matchRule, normalize } from '../rules.js';

function categoryGrid(categories, selectedId, onChange) {
  return h('fieldset', { class: 'cat-grid' },
    h('legend', { class: 'label' }, 'Category'),
    categories.map((c) => h('label', { class: 'cat-chip', style: { '--dot': c.color } },
      h('input', { type: 'radio', name: 'tx-category', value: c.id, checked: c.id === selectedId, onchange: () => onChange(c.id) }),
      h('span', { class: 'cat-chip__body' }, h('span', { 'aria-hidden': 'true' }, c.emoji), h('span', { class: 'cat-chip__name' }, c.name)),
    )),
  );
}

/** Suggested rule keyword from a description: first two meaningful words. */
function suggestKeyword(description) {
  return normalize(description).split(' ').filter((w) => w.length > 1 && !/^\d+$/.test(w)).slice(0, 2).join(' ');
}

export async function openTransactionForm({ tx = null, quick = !tx } = {}) {
  const [categories, people] = await Promise.all([listCategories({ includeArchived: !!tx }), listPeople()]);
  const others = people.filter((p) => p.id !== ME);
  const s = settings();
  const isNew = !tx;
  const t = tx ?? newTransaction();
  const visibleCats = categories.filter((c) => !c.archived || c.id === t.categoryId);
  let categoryId = t.categoryId;
  let mode = t.splitMode ?? 'mine';

  // --- Controls ------------------------------------------------------------
  const amount = h('input', {
    id: 'tx-amount', class: 'amount-input__field amount', type: 'text', inputmode: 'decimal', autocomplete: 'off',
    placeholder: '0,00', value: t.amount ? centsToInput(Math.abs(t.amount)) : '', 'aria-label': 'Amount', autofocus: isNew,
  });
  const currencySymbol = new Intl.NumberFormat(s.numberLocale, { style: 'currency', currency: s.currency })
    .formatToParts(0).find((p) => p.type === 'currency')?.value ?? '€';

  const description = h('input', { class: 'input', type: 'text', value: t.description, autocomplete: 'off', placeholder: 'e.g. Monoprix, dinner out' });
  const date = h('input', { class: 'input', type: 'date', value: t.date, required: true });
  const refund = h('input', { type: 'checkbox', checked: t.amount < 0 });
  const note = h('textarea', { class: 'input textarea', rows: '2' }, t.note ?? '');

  const paidBy = h('select', { class: 'select' },
    people.map((p) => h('option', { value: p.id, selected: p.id === (t.iPaid === 0 && t.amount !== 0 ? t.counterpartId : ME) }, p.id === ME ? `${p.name} (you)` : p.name)));
  const counterpart = h('select', { class: 'select' },
    others.map((p) => h('option', { value: p.id, selected: p.id === (t.counterpartId ?? s.defaultCounterpart) }, p.name)));
  const customShare = h('input', {
    class: 'input amount', type: 'text', inputmode: 'decimal', autocomplete: 'off',
    value: t.splitMode === 'custom' ? centsToInput(Math.abs(t.myShare)) : '', placeholder: 'e.g. 12,50 or 40%',
  });
  const customRow = field('tx-custom', 'My share', customShare, 'An amount, or a percentage like 40%.');
  const counterpartRow = field('tx-counterpart', 'Shared with', counterpart);

  const spreadOn = h('input', { type: 'checkbox', checked: !!t.spread });
  const spreadFrom = h('input', { class: 'input', type: 'date', value: t.spread?.from ?? s.periodStart });
  const spreadTo = h('input', { class: 'input', type: 'date', value: t.spread?.to ?? s.periodEnd });
  const spreadDates = h('div', { class: 'grid-2' }, field('tx-spread-from', 'From', spreadFrom), field('tx-spread-to', 'To', spreadTo));

  // "Always categorise like this" (editor only, when there is a description)
  const ruleOn = h('input', { type: 'checkbox' });
  const ruleKeyword = h('input', { class: 'input', type: 'text', autocapitalize: 'characters', value: suggestKeyword(t.description) });
  const ruleBox = h('div', { class: 'stack', hidden: true },
    h('label', { class: 'check' }, ruleOn, h('span', {}, 'Always categorise like this')),
    h('div', { hidden: true }, field('tx-rule-kw', 'When the description contains', ruleKeyword)),
  );
  ruleOn.addEventListener('change', () => { ruleBox.lastElementChild.hidden = !ruleOn.checked; });

  const sync = () => {
    customRow.hidden = mode !== 'custom';
    counterpartRow.hidden = (mode === 'mine' && paidBy.value === ME) || paidBy.value !== ME || others.length === 0;
    spreadDates.hidden = !spreadOn.checked;
    ruleBox.hidden = isNew || !description.value.trim() || !categoryId || categoryId === tx?.categoryId;
  };
  paidBy.addEventListener('change', sync);
  spreadOn.addEventListener('change', sync);
  description.addEventListener('input', () => { if (!ruleOn.checked) ruleKeyword.value = suggestKeyword(description.value); sync(); });

  const splitControl = segmented('tx-split', 'Split', SPLIT_MODES, mode, (v) => { mode = v; sync(); });

  const details = h('details', { class: 'details', open: !quick },
    h('summary', {}, 'More details'),
    h('div', { class: 'form' },
      field('tx-description', 'Description', description),
      h('div', { class: 'grid-2' },
        field('tx-date', 'Date', date),
        field('tx-paidby', 'Paid by', paidBy),
      ),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Split'), splitControl),
      customRow,
      counterpartRow,
      h('label', { class: 'check' }, refund, h('span', {}, 'This is a refund (money back)')),
      h('label', { class: 'check' }, spreadOn, h('span', {}, 'Spread the cost over a period'),
      ),
      h('p', { class: 'small muted', style: { marginTop: 'calc(-1 * var(--s-1))' } }, 'For costs that cover several months, like rent. Charts and budgets spread it; this list keeps the payment date.'),
      spreadDates,
      field('tx-note', 'Note', note),
    ),
  );

  const content = h('div', { class: 'form' },
    h('div', { class: 'amount-input' }, h('span', { class: 'amount-input__symbol', 'aria-hidden': 'true' }, currencySymbol), amount),
    categoryGrid(visibleCats, categoryId, (id) => { categoryId = id; sync(); }),
    ruleBox,
    details,
    !isNew && h('div', { class: 'danger-zone' },
      h('button', { class: 'btn btn--danger', type: 'button', onclick: async () => {
        dlg.close();
        if (await confirmDialog('Delete this expense?', `${t.description || 'Expense'} · ${money(t.amount)}`, 'Delete', { danger: true })) {
          await deleteTransaction(t.id);
          toast('Expense deleted.', { action: 'Undo', onAction: () => saveTransaction(t) });
        }
      } }, 'Delete'),
    ),
  );
  sync();

  // --- Save ------------------------------------------------------------------
  async function save() {
    const cents = parseAmount(amount.value);
    if (!cents || cents <= 0) { fieldError(amount, 'Enter an amount, e.g. 12,50.'); return false; }
    if (!date.value) { details.open = true; fieldError(date, 'Pick a date.'); return false; }
    const total = refund.checked ? -cents : cents;

    let share = 0;
    if (mode === 'custom') {
      const raw = customShare.value.trim();
      share = raw.endsWith('%')
        ? Math.round((total * Number(raw.slice(0, -1).replace(',', '.'))) / 100)
        : (parseAmount(raw) ?? NaN) * Math.sign(total);
      if (!Number.isFinite(share) || Math.abs(share) > Math.abs(total)) {
        details.open = true; fieldError(customShare, `Enter up to ${money(cents)} or a percentage.`); return false;
      }
    }
    if (spreadOn.checked && (!spreadFrom.value || !spreadTo.value || spreadTo.value < spreadFrom.value)) {
      details.open = true; fieldError(spreadTo, 'The end must be after the start.'); return false;
    }

    const saved = await saveTransaction({
      ...t,
      amount: total,
      kind: refund.checked ? 'refund' : t.kind === 'settlement' ? 'settlement' : 'expense',
      description: description.value.trim(),
      date: date.value,
      note: note.value.trim(),
      categoryId: categoryId ?? null,
      spread: spreadOn.checked ? { from: spreadFrom.value, to: spreadTo.value } : null,
      ...computeSplit({ amount: total, mode, customShare: share, paidBy: paidBy.value, counterpartId: counterpart.value || s.defaultCounterpart }),
    });

    if (!ruleBox.hidden && ruleOn.checked && normalize(ruleKeyword.value)) {
      const rule = await upsertRuleForKeyword(ruleKeyword.value.toUpperCase(), categoryId);
      // Apply the new rule to everything still waiting in the inbox.
      const inbox = (await listTransactions()).filter((x) => inInbox(x) && matchRule(x.description, [rule]));
      if (inbox.length) await updateMany(inbox, { categoryId });
      toast(`Rule saved${inbox.length ? ` · ${inbox.length} more from the inbox categorised` : ''}.`);
    } else {
      toast(isNew ? `Added ${money(saved.myShare)}${saved.myShare !== saved.amount ? ` (your share of ${money(saved.amount)})` : ''}.` : 'Saved.');
    }
  }

  const dlg = openDialog({
    title: isNew ? 'Add expense' : 'Edit expense',
    content,
    actions: [{ label: 'Cancel' }, { label: isNew ? 'Save' : 'Save changes', variant: 'primary', onClick: save }],
  });
  if (isNew) amount.focus();
  return dlg;
}

