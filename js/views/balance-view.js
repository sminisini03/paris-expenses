// Balance with a person: who owes whom, settle up, and what it's made of.

import { h, icon, pageHeader, backLink, segmented, field, openDialog, confirmDialog, fieldError, toast, selectOnFocus } from '../ui.js';
import { listTransactions, newTransaction, saveTransaction, deleteTransaction } from '../transactions.js';
import { listPeople, ME } from '../people.js';
import { settings } from '../settings.js';
import { balanceWith, settlementFields, isSettlement } from '../balance.js';
import { money, date as fmtDate, parseAmount, centsToInput, todayIso } from '../format.js';
import { navigate } from '../app.js';
import { openTransactionForm } from './tx-form.js';

/** Plain-language balance line. */
export function balanceText(cents, name) {
  if (cents > 0) return `${name} owes you`;
  if (cents < 0) return `You owe ${name}`;
  return 'All settled up';
}

/** Record (or edit) a payment between you and a person. */
export function openSettleUp({ person, balance = 0, tx = null }) {
  const name = person.name;
  let theyPaidMe = tx ? tx.iPaid < 0 : balance >= 0;
  const amount = h('input', {
    id: 'settle-amount', class: 'amount-input__field amount', type: 'text', inputmode: 'decimal', autocomplete: 'off',
    value: tx ? centsToInput(tx.amount) : balance ? centsToInput(Math.abs(balance)) : '', placeholder: '0,00', 'aria-label': 'Amount',
  });
  selectOnFocus(amount);
  const day = h('input', { class: 'input', type: 'date', value: tx?.date ?? todayIso() });
  const note = h('input', { class: 'input', type: 'text', value: tx?.note ?? '', placeholder: 'e.g. bank transfer, cash' });

  const dlg = openDialog({
    title: tx ? 'Edit settlement' : `Settle up with ${name}`,
    content: h('div', { class: 'form' },
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Who paid'),
        segmented('settle-dir', 'Who paid', [['in', `${name} paid me`], ['out', `I paid ${name}`]], theyPaidMe ? 'in' : 'out', (v) => { theyPaidMe = v === 'in'; })),
      h('div', { class: 'amount-input' }, h('span', { class: 'amount-input__symbol', 'aria-hidden': 'true' }, '€'), amount),
      balance !== 0 && !tx && h('p', { class: 'small muted' }, `Current balance: ${balanceText(balance, name).toLowerCase()} ${money(Math.abs(balance))}. A settlement is not counted as spending.`),
      h('div', { class: 'grid-2' }, field('settle-date', 'Date', day), field('settle-note', 'Note', note)),
      tx && h('div', { class: 'danger-zone' }, h('button', { class: 'btn btn--danger', type: 'button', onclick: async () => {
        dlg.close();
        if (await confirmDialog('Delete settlement?', `${money(tx.amount)} on ${fmtDate(tx.date)}`, 'Delete', { danger: true })) {
          await deleteTransaction(tx.id);
          toast('Settlement deleted.', { action: 'Undo', onAction: () => saveTransaction(tx) });
        }
      } }, 'Delete')),
    ),
    actions: [{ label: 'Cancel' }, { label: tx ? 'Save' : 'Record payment', variant: 'primary', onClick: async () => {
      const cents = parseAmount(amount.value);
      if (!cents || cents <= 0) { fieldError(amount, 'Enter the amount paid.'); return false; }
      // Catch typos like "500" landing in front of a prefilled "951,98".
      const owedInThatDirection = theyPaidMe ? balance : -balance;
      if (!tx && cents > Math.max(owedInThatDirection, 0)) {
        const more = money(cents - Math.max(owedInThatDirection, 0));
        const ok = await confirmDialog('More than what is owed', `${money(cents)} is ${more} more than the current balance. Record it anyway (e.g. paying ahead)?`, 'Record anyway');
        if (!ok) { amount.focus(); return false; }
      }
      await saveTransaction({
        ...(tx ?? newTransaction()),
        ...settlementFields({ amount: cents, personId: person.id, theyPaidMe }),
        date: day.value || todayIso(),
        description: theyPaidMe ? `${name} paid me` : `I paid ${name}`,
        note: note.value.trim(),
      });
      toast(tx ? 'Saved.' : `Recorded: ${theyPaidMe ? `${name} paid you` : `you paid ${name}`} ${money(cents)}.`);
    } }],
  });
  if (!tx) amount.focus();
}

export async function render(main, params = {}) {
  const [txs, people] = await Promise.all([listTransactions(), listPeople()]);
  const others = people.filter((p) => p.id !== ME);
  if (!others.length) {
    main.append(pageHeader('Balance'), h('p', { class: 'muted' }, 'Add someone in Settings → People to split expenses.'));
    return;
  }
  const person = others.find((p) => p.id === params.person) ?? others.find((p) => p.id === settings().defaultCounterpart) ?? others[0];
  const today = todayIso();
  const b = balanceWith(txs, person.id, today);
  const upcomingItems = txs.filter((t) => t.counterpartId === person.id && t.date > today && t.iPaid !== t.myShare)
    .sort((a, b2) => a.date.localeCompare(b2.date));

  const signed = (c) => `${c > 0 ? '+' : '−'} ${money(Math.abs(c))}`;
  const itemRow = (t, owed) => h('li', {}, h('button', {
    class: 'row row__btn tx-row', type: 'button', 'data-key': `bal-${t.id}`,
    onclick: () => (isSettlement(t) ? openSettleUp({ person, tx: t }) : openTransactionForm({ tx: t })),
  },
    h('span', { class: 'row__main' },
      h('span', { class: 'row__title', style: { display: 'block' } }, t.description || 'Expense'),
      h('span', { class: 'row__hint', style: { display: 'block' } }, fmtDate(t.date), isSettlement(t) ? ' · settlement' : ` · total ${money(t.amount)}`),
    ),
    h('span', { class: 'row__amount amount' }, signed(owed)),
  ));

  main.append(
    backLink('#/overview', 'Overview'),
    pageHeader(`Balance with ${person.name}`, '+ means they owe you more, − means you owe them more'),
    ...(others.length > 1 ? [h('div', { style: { marginBottom: 'var(--s-2)' } },
      segmented('bal-person', 'Person', others.map((p) => [p.id, p.name]), person.id, (id) => navigate('balance', { person: id })))] : []),
    h('section', { class: 'card stack', 'aria-labelledby': 'bal-label' },
      h('h2', { class: 'label', id: 'bal-label' }, balanceText(b.now, person.name)),
      h('p', { class: 'big-number' }, money(Math.abs(b.now))),
      b.upcoming !== 0 && h('p', { class: 'small muted' },
        `${b.upcoming > 0 ? `${person.name} will owe` : 'You will owe'} ${money(Math.abs(b.upcoming))} more as scheduled payments fall due.`),
      h('div', {}, h('button', { class: 'btn btn--primary', type: 'button', 'data-key': 'settle', onclick: () => openSettleUp({ person, balance: b.now }) }, icon('check'), 'Settle up')),
    ),
    h('h2', { class: 'section-title' }, 'History'),
    b.items.length
      ? h('ul', { class: 'list' }, b.items.map(({ t, owed }) => itemRow(t, owed)))
      : h('p', { class: 'small muted' }, `Nothing shared with ${person.name} yet.`),
    ...(upcomingItems.length ? [
      h('h2', { class: 'section-title' }, 'Scheduled'),
      h('ul', { class: 'list' }, upcomingItems.map((t) => itemRow(t, t.iPaid - t.myShare))),
    ] : []),
  );
}
