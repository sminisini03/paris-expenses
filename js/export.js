// Backups: one JSON file with everything (transactions, categories, rules,
// people, settings). Also the way to move data between iPhone and laptop,
// since each browser keeps its own separate storage.

import * as db from './db.js';
import { amountBetween, dayNum, periodMonths, budgetFor } from './budget.js';
import { isSettlement } from './balance.js';
import { ME } from './people.js';
import { month as monthName, date as fmtDate } from './format.js';

const FORMAT = 'paris-expenses-backup';
const FORMAT_VERSION = 1;
const DATA_STORES = ['transactions', 'categories', 'rules', 'people', 'settings', 'imports'];

export async function buildBackup() {
  const data = {};
  for (const name of DATA_STORES) data[name] = await db.getAll(name);
  return { format: FORMAT, version: FORMAT_VERSION, exportedAt: new Date().toISOString(), data };
}

/** Save a file: share sheet on phones (→ Save to Files), plain download elsewhere. */
export async function saveFile(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false;   // user closed the share sheet
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

export async function downloadBackup() {
  const backup = await buildBackup();
  const stamp = backup.exportedAt.slice(0, 16).replace(/[:T]/g, '-');
  const ok = await saveFile(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), `paris-expenses-backup-${stamp}.json`);
  if (ok) await db.put('meta', { key: 'lastBackupAt', value: backup.exportedAt });
  return ok;
}

export async function lastBackupAt() {
  return (await db.get('meta', 'lastBackupAt'))?.value ?? null;
}

/** Validate and summarise a backup file before restoring it. */
export function inspectBackup(json) {
  let parsed;
  try { parsed = JSON.parse(json); } catch { throw new Error('This file is not valid JSON.'); }
  if (parsed?.format !== FORMAT || typeof parsed.data !== 'object') throw new Error('This is not a Paris Expenses backup file.');
  if (parsed.version > FORMAT_VERSION) throw new Error('This backup comes from a newer version of the app. Update the app first.');
  const counts = Object.fromEntries(DATA_STORES.map((n) => [n, Array.isArray(parsed.data[n]) ? parsed.data[n].length : 0]));
  return { backup: parsed, counts };
}

/**
 * mode 'merge': add records whose id isn't here yet (never overwrites).
 * mode 'replace': wipe and load exactly what's in the file.
 * Returns how many records were added per store.
 */
export async function restoreBackup(backup, mode = 'merge') {
  const changes = {};
  const added = {};
  for (const name of DATA_STORES) {
    const incoming = Array.isArray(backup.data[name]) ? backup.data[name] : [];
    const keyPath = db.STORES[name].keyPath;
    if (mode === 'replace') {
      changes[name] = { clear: true, put: incoming };
      added[name] = incoming.length;
    } else {
      const existing = new Set((await db.getAll(name)).map((r) => r[keyPath]));
      const fresh = incoming.filter((r) => !existing.has(r[keyPath]));
      changes[name] = { put: fresh };
      added[name] = fresh.length;
    }
  }
  await db.batch(changes);
  db.emitDataChange();
  return added;
}

// ---- Excel export -------------------------------------------------------------
// Same logic as the original cost sheet: an "Overall" block, then one block per
// month, with Total / <each person> / Me columns per category. Plus a raw
// Transactions sheet. Pure data here; the browser part is in downloadXlsx().


const euros = (cents) => Math.round(cents) / 100;

export function buildWorkbookData({ txs, categories, people, period }) {
  const me = people.find((p) => p.id === ME) ?? { id: ME, name: 'Me' };
  const others = people.filter((p) => p.id !== ME);
  const spend = txs.filter((t) => !isSettlement(t));
  const used = new Set(spend.map((t) => t.categoryId ?? 'none'));
  const cats = categories.filter((c) => !c.archived || used.has(c.id));
  const rowsDef = [...cats.map((c) => ({ id: c.id, name: c.name, cat: c })), ...(used.has('none') ? [{ id: 'none', name: 'Uncategorised' }] : [])];
  const header = ['Category', 'Total', ...others.map((p) => p.name), me.name, `Budget (${me.name})`];

  function block(title, lo, hi, budgetOf) {
    const rows = rowsDef.map(({ id, name, cat }) => {
      let total = 0, mine = 0;
      const per = Object.fromEntries(others.map((p) => [p.id, 0]));
      for (const t of spend) {
        if ((t.categoryId ?? 'none') !== id) continue;
        const tot = amountBetween(t, lo, hi, 'total');
        const my = amountBetween(t, lo, hi, 'mine');
        total += tot; mine += my;
        if (t.counterpartId && t.counterpartId in per) per[t.counterpartId] += tot - my;
      }
      return { name, total, per, mine, budget: cat ? budgetOf(cat) : 0 };
    }).filter((r) => r.total || r.mine || r.budget);
    const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
    return [
      [title],
      header,
      ...rows.map((r) => [r.name, euros(r.total), ...others.map((p) => euros(r.per[p.id])), euros(r.mine), r.budget ? euros(r.budget) : null]),
      ['Total', euros(sum((r) => r.total)), ...others.map((p) => euros(sum((r) => r.per[p.id]))), euros(sum((r) => r.mine)), euros(sum((r) => r.budget)) || null],
      [],
    ];
  }

  const months = periodMonths(period);
  const startD = dayNum(period.start), endD = dayNum(period.end);
  const summary = [
    ...block(`Overall · ${fmtDate(period.start)} – ${fmtDate(period.end)}`, startD, endD,
      (c) => months.reduce((s, m) => s + budgetFor(c, m, period), 0)),
    ...months.flatMap((m) => block(monthName(m),
      Math.max(dayNum(`${m}-01`), startD),
      Math.min(dayNum(`${m}-01`) + new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate() - 1, endD),
      (c) => budgetFor(c, m, period))),
  ];

  const name = (id) => people.find((p) => p.id === id)?.name ?? '';
  const catName = (id) => categories.find((c) => c.id === id)?.name ?? (id ? id : 'Uncategorised');
  const splitLabel = { mine: 'Mine', shared: '50/50', custom: 'Custom', theirs: 'Theirs', settlement: 'Settlement' };
  const transactions = [
    ['Date', 'Description', 'Category', 'Type', 'Total', me.name, 'Others', 'Paid by', 'Shared with', 'Split', 'Spread from', 'Spread to', 'Source', 'Note'],
    ...[...txs].sort((a, b) => a.date.localeCompare(b.date)).map((t) => [
      t.date, t.description, isSettlement(t) ? '' : catName(t.categoryId),
      isSettlement(t) ? 'Settlement' : t.amount < 0 ? 'Refund' : 'Expense',
      euros(t.amount), euros(t.myShare), isSettlement(t) ? null : euros(t.amount - t.myShare),
      t.iPaid === 0 || (isSettlement(t) && t.iPaid < 0) ? name(t.counterpartId) : me.name,
      name(t.counterpartId), splitLabel[t.splitMode] ?? '',
      t.spread?.from ?? '', t.spread?.to ?? '', t.source, t.note ?? '',
    ]),
  ];
  return { summary, transactions };
}

let xlsxLoading;
function loadSheetJs() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  xlsxLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/xlsx.mini.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => { xlsxLoading = null; reject(new Error('Could not load the Excel library.')); };
    document.head.append(s);
  });
  return xlsxLoading;
}

const EURO_FORMAT = '#,##0.00 "€"';

function toSheet(XLSX, aoa, widths) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (const [ref, cell] of Object.entries(ws)) {
    if (ref[0] !== '!' && cell.t === 'n') cell.z = EURO_FORMAT;
  }
  ws['!cols'] = widths.map((wch) => ({ wch }));
  return ws;
}

export async function downloadXlsx({ txs, categories, people, period }) {
  const XLSX = await loadSheetJs();
  const data = buildWorkbookData({ txs, categories, people, period });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, toSheet(XLSX, data.summary, [26, 14, ...data.summary[1].slice(2).map(() => 14)]), 'Summary');
  XLSX.utils.book_append_sheet(wb, toSheet(XLSX, data.transactions, [11, 34, 22, 11, 12, 12, 12, 12, 12, 10, 11, 11, 9, 30]), 'Transactions');
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true });
  const stamp = new Date().toISOString().slice(0, 10);
  return saveFile(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `paris-expenses-${stamp}.xlsx`);
}
