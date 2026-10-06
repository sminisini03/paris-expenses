import { h, pageHeader, toast, segmented, colorPicker, linkRow, openDialog } from '../ui.js';
import { settings, setSetting, loadSettings, ACCENT_PRESETS } from '../settings.js';
import { listCategories } from '../categories.js';
import { listRules } from '../rules.js';
import { listPeople } from '../people.js';
import { NUMBER_FORMATS, moneyExample, date as fmtDate } from '../format.js';
import { downloadBackup, lastBackupAt, inspectBackup, restoreBackup } from '../export.js';
import { APP_VERSION } from '../app.js';
import { pickAndImport } from './import-flow.js';

const SUBPAGES = {
  categories: () => import('./settings-categories.js'),
  rules: () => import('./settings-rules.js'),
  people: () => import('./settings-people.js'),
};

const STORE_LABELS = { transactions: 'transactions', categories: 'categories', rules: 'rules', people: 'people', settings: 'settings', imports: 'import logs' };

async function backupRows() {
  const last = await lastBackupAt();
  const backupBtn = h('button', { class: 'btn', type: 'button', 'data-key': 'backup', onclick: async () => {
    if (await downloadBackup()) { toast('Backup saved.'); window.dispatchEvent(new Event('datachange')); }
  } }, 'Back up now');

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'visually-hidden', id: 'restore-file' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    let info;
    try { info = inspectBackup(await file.text()); } catch (err) { toast(err.message); return; }
    let mode = 'merge';
    const summary = Object.entries(info.counts).filter(([, n]) => n).map(([k, n]) => `${n} ${STORE_LABELS[k]}`).join(', ');
    openDialog({
      title: 'Restore backup',
      content: h('div', { class: 'form' },
        h('p', {}, `${file.name}`, h('br'), h('span', { class: 'small muted' }, `Contains ${summary || 'nothing'}.`)),
        segmented('restore-mode', 'Restore mode', [['merge', 'Add missing'], ['replace', 'Replace all']], mode, (v) => { mode = v; }),
        h('p', { class: 'small muted' }, '"Add missing" keeps everything here and only adds records that are not on this device yet. "Replace all" deletes the data on this device first.'),
      ),
      actions: [{ label: 'Cancel' }, { label: 'Restore', variant: 'primary', onClick: async () => {
        const added = await restoreBackup(info.backup, mode);
        await loadSettings();
        toast(`Restored: ${added.transactions} transactions added.`);
      } }],
    });
  });

  return [
    h('li', { class: 'row' },
      h('div', { class: 'row__main' },
        h('div', { class: 'row__title' }, 'Backup'),
        h('div', { class: 'row__hint' }, last ? `Last backup ${fmtDate(last)}` : 'Never backed up. iOS can clear app data, so back up weekly.'),
      ),
      backupBtn,
    ),
    h('li', { class: 'row' },
      h('div', { class: 'row__main' },
        h('div', { class: 'row__title' }, 'Revolut statement'),
        h('div', { class: 'row__hint' }, 'Import a CSV exported from the Revolut app. Re-importing is safe: duplicates are skipped.'),
      ),
      h('button', { class: 'btn', type: 'button', 'data-key': 'import-csv', onclick: pickAndImport }, 'Import CSV'),
    ),
    h('li', { class: 'row' },
      h('div', { class: 'row__main' },
        h('div', { class: 'row__title' }, 'Restore or import'),
        h('div', { class: 'row__hint' }, 'Load a backup file, e.g. to move data from your laptop to your iPhone.'),
      ),
      fileInput,
      h('label', { class: 'btn', for: 'restore-file', tabindex: '0', role: 'button', 'data-key': 'restore',
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } } }, 'Choose file'),
    ),
  ];
}

function row(labelText, control, hint) {
  return h('li', { class: 'row row--stack' },
    h('div', {}, h('div', { class: 'row__title' }, labelText), hint && h('div', { class: 'row__hint' }, hint)),
    control,
  );
}

function periodRow(s) {
  const start = h('input', { class: 'input', type: 'date', id: 'period-start', value: s.periodStart, required: true });
  const end = h('input', { class: 'input', type: 'date', id: 'period-end', value: s.periodEnd, required: true });
  const save = async () => {
    if (!start.value || !end.value || end.value < start.value) {
      toast('The end date must be after the start date.');
      start.value = settings().periodStart; end.value = settings().periodEnd;
      return;
    }
    await setSetting('periodStart', start.value);
    await setSetting('periodEnd', end.value);
  };
  start.addEventListener('change', save);
  end.addEventListener('change', save);
  return h('li', { class: 'row row--stack' },
    h('div', { class: 'row__title' }, 'Exchange period'),
    h('div', { class: 'grid-2' },
      h('div', { class: 'field' }, h('label', { class: 'label', for: 'period-start' }, 'Start'), start),
      h('div', { class: 'field' }, h('label', { class: 'label', for: 'period-end' }, 'End'), end),
    ),
  );
}

async function storageRow() {
  const status = h('div', { class: 'row__hint' }, 'Checking…');
  const btn = h('button', { class: 'btn', type: 'button', hidden: true }, 'Ask to keep data');
  const refresh = async () => {
    const persisted = await navigator.storage?.persisted?.();
    const est = await navigator.storage?.estimate?.();
    const used = est ? `${(est.usage / 1024).toFixed(0)} KB used` : '';
    status.textContent = persisted
      ? `Protected from automatic clearing. ${used}`
      : `The browser may clear this data if the device runs low on space. Keep backups. ${used}`;
    btn.hidden = persisted || !navigator.storage?.persist;
  };
  btn.addEventListener('click', async () => {
    const ok = await navigator.storage.persist();
    toast(ok ? 'Storage is now protected.' : 'The browser declined. Installing the app to the Home Screen usually helps.');
    refresh();
  });
  refresh();
  return h('li', { class: 'row row--stack' }, h('div', {}, h('div', { class: 'row__title' }, 'Storage on this device'), status), btn);
}

export async function render(main, params = {}) {
  if (SUBPAGES[params.section]) return (await SUBPAGES[params.section]()).render(main, params);

  const s = settings();
  const [categories, rules, people] = await Promise.all([listCategories(), listRules(), listPeople()]);
  const fmtSelect = h('select', { class: 'select', id: 'number-format', onchange: (e) => setSetting('numberLocale', e.target.value) },
    NUMBER_FORMATS.map(({ locale }) => h('option', { value: locale, selected: locale === s.numberLocale }, moneyExample(locale))),
  );

  main.append(
    pageHeader('Settings'),

    h('h2', { class: 'section-title' }, 'Spending'),
    h('ul', { class: 'list' },
      linkRow('#/settings?section=categories', 'Categories', 'Names, icons, colours, budgets, order', String(categories.length)),
      linkRow('#/settings?section=rules', 'Category rules', 'Keyword → category for imports', String(rules.length)),
      linkRow('#/settings?section=people', 'People', 'Who you split with', people.map((p) => p.name).join(', ')),
    ),

    h('h2', { class: 'section-title' }, 'Appearance'),
    h('ul', { class: 'list' },
      row('Theme', segmented('theme', 'Theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], s.theme, (v) => setSetting('theme', v))),
      row('Accent colour', colorPicker('accent', 'Accent colour', ACCENT_PRESETS, s.accent, (hex) => setSetting('accent', hex)), 'Buttons, links and highlights. Categories keep their own colours.'),
    ),

    h('h2', { class: 'section-title' }, 'Region'),
    h('ul', { class: 'list' },
      h('li', { class: 'row row--stack' },
        h('label', { class: 'row__title', for: 'number-format' }, 'Number format'),
        fmtSelect,
      ),
    ),

    h('h2', { class: 'section-title' }, 'Exchange'),
    h('ul', { class: 'list' }, periodRow(s)),

    h('h2', { class: 'section-title' }, 'Data'),
    h('ul', { class: 'list' },
      ...(await backupRows()),
      await storageRow(),
      h('li', { class: 'row' }, h('div', { class: 'row__main' },
        h('div', { class: 'row__title' }, 'Privacy'),
        h('div', { class: 'row__hint' }, 'All data stays in this browser. Nothing is sent anywhere.'),
      )),
    ),

    h('p', { class: 'small muted', style: { marginTop: 'var(--s-3)', textAlign: 'center' } }, `Version ${APP_VERSION}`),
  );
}
