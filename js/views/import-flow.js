// Revolut CSV import: pick file → preview what will happen → import.

import { h, field, openDialog, toast } from '../ui.js';
import * as db from '../db.js';
import { planImport } from '../import.js';
import { listTransactions } from '../transactions.js';
import { listRules } from '../rules.js';
import { settings, setSetting } from '../settings.js';
import { date as fmtDate, money } from '../format.js';
import { navigate } from '../app.js';

/** Open the system file picker (must be called from a tap/click). */
export function pickAndImport() {
  const input = h('input', { type: 'file', accept: '.csv,text/csv', class: 'visually-hidden' });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.remove();
    if (file) await previewImport(await file.text(), file.name);
  });
  document.body.append(input);
  input.click();
}

const selfNamesList = (str) => str.split(',').map((s) => s.trim()).filter(Boolean);

export async function previewImport(text, fileName) {
  const [existing, rules] = await Promise.all([listTransactions(), listRules()]);
  const batchId = db.uid();
  const now = new Date().toISOString();
  let plan;

  const run = () => {
    const s = settings();
    plan = planImport(text, existing, rules, {
      periodStart: s.periodStart, periodEnd: s.periodEnd, currency: s.currency,
      selfNames: selfNamesList(selfName.value), defaultCounterpart: s.defaultCounterpart,
      batchId, newId: db.uid, now,
    });
  };

  const selfName = h('input', { class: 'input', type: 'text', value: settings().selfNames, autocomplete: 'name', placeholder: 'e.g. Alex Example' });
  const body = h('div', { class: 'stack' });
  const importBtnLabel = () => { const n = plan.summary.added + plan.summary.linked; return n ? `Import ${n}` : 'Nothing to import'; };

  const draw = () => {
    const s = plan.summary;
    const outgoingTransfers = plan.add.filter((t) => /^to /i.test(t.description));
    const byReason = Map.groupBy
      ? Map.groupBy(s.excluded, (e) => e.reason)
      : s.excluded.reduce((m, e) => m.set(e.reason, [...(m.get(e.reason) ?? []), e]), new Map());

    body.replaceChildren(
      h('ul', { class: 'list summary-list' },
        h('li', { class: 'row' }, h('span', { class: 'row__main' }, 'New expenses'), h('strong', { class: 'amount' }, String(s.added))),
        s.linked > 0 && h('li', { class: 'row' }, h('span', { class: 'row__main' }, 'Matched to expenses you already entered'), h('strong', { class: 'amount' }, String(s.linked))),
        h('li', { class: 'row' }, h('span', { class: 'row__main' }, 'Already imported, skipped'), h('strong', { class: 'amount' }, String(s.duplicates))),
        h('li', { class: 'row' }, h('span', { class: 'row__main' }, 'Not spending, skipped'), h('strong', { class: 'amount' }, String(s.excluded.length))),
        h('li', { class: 'row' }, h('span', { class: 'row__main' }, 'Need a category (go to inbox)'), h('strong', { class: 'amount' }, String(s.uncategorized))),
      ),
      s.excluded.length > 0 && h('details', { class: 'details' },
        h('summary', {}, 'Why rows were skipped'),
        h('ul', { class: 'list' }, [...byReason].map(([reason, items]) => h('li', { class: 'row row--stack' },
          h('div', { class: 'row__title' }, `${reason} (${items.length})`),
          h('div', { class: 'row__hint' }, items.map((e) => `${fmtDate(e.row.date)} · ${e.row.description} · ${money(-e.row.amount)}`).join('\n')),
        ))),
      ),
      outgoingTransfers.length > 0 && h('div', { class: 'callout' },
        h('p', { class: 'small' }, `${outgoingTransfers.length} transfer${outgoingTransfers.length === 1 ? '' : 's'} to people will be added as expenses (e.g. paying a friend back). If any go to your own accounts, enter your name as Revolut shows it:`),
        field('import-self', 'Your name on transfers', selfName, 'Comma-separate several spellings.'),
      ),
    );
    dlg.dialog.querySelector('button[type="submit"]').textContent = importBtnLabel();
  };

  selfName.addEventListener('change', () => { run(); draw(); selfName.focus(); });

  try { run(); } catch (err) { toast(err.message, { duration: 6000 }); return; }

  const dlg = openDialog({
    title: 'Import Revolut statement',
    content: h('div', { class: 'form' }, h('p', { class: 'small muted' }, `${fileName} · ${plan.summary.rows} rows`), body),
    actions: [
      { label: 'Cancel' },
      { label: 'Import', variant: 'primary', onClick: async () => {
        const s = plan.summary;
        if (!s.added && !s.linked) return;
        if (selfName.value.trim() !== settings().selfNames) await setSetting('selfNames', selfName.value.trim());
        await db.batch({
          transactions: { put: [...plan.add, ...plan.link] },
          imports: { put: [{ id: batchId, at: now, fileName, added: s.added, linked: s.linked, duplicates: s.duplicates, excluded: s.excluded.length }] },
        });
        db.emitDataChange();
        toast(`Imported ${s.added} expense${s.added === 1 ? '' : 's'}${s.uncategorized ? ` · ${s.uncategorized} to categorise` : ''}.`,
          s.uncategorized ? { action: 'Review', onAction: () => navigate('inbox'), duration: 8000 } : {});
      } },
    ],
  });
  draw();
}
