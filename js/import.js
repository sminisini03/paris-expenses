// Revolut CSV import. Pure functions (no DOM, no storage) so they can be
// tested in Node: parse → normalise → classify → de-duplicate → match plan
// items → categorise → match refunds. The caller writes the result.

import { matchRule, normalize } from './rules.js';
import { computeSplit } from './split.js';

// ---- CSV parsing (RFC 4180: quotes, escaped quotes, commas/newlines in quotes)

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

// ---- Normalising Revolut rows ------------------------------------------------

const REQUIRED = ['type', 'started date', 'description', 'amount', 'currency', 'state'];

/** "−7.50" / "-7,50" / "1,234.56" → cents. Revolut exports use a dot decimal. */
function toCents(v) {
  const n = Number(String(v ?? '').trim().replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export function readRevolut(text) {
  const [header, ...body] = parseCsv(text);
  if (!header) throw new Error('The file is empty.');
  const idx = Object.fromEntries(header.map((h, i) => [h.trim().toLowerCase(), i]));
  const missing = REQUIRED.filter((k) => !(k in idx));
  if (missing.length) throw new Error(`This doesn't look like a Revolut statement (missing: ${missing.join(', ')}).`);
  const get = (r, k) => (k in idx ? (r[idx[k]] ?? '').trim() : '');
  return body.map((r, line) => {
    const started = get(r, 'started date');
    return {
      line: line + 2,                                  // 1-based, after the header
      type: get(r, 'type'),
      product: get(r, 'product'),
      started,
      date: started.slice(0, 10),
      time: started.slice(11, 19),
      completed: get(r, 'completed date'),
      description: get(r, 'description'),
      amount: toCents(get(r, 'amount')),               // negative = money out
      fee: toCents(get(r, 'fee') || '0'),              // positive = charged on top
      currency: get(r, 'currency').toUpperCase(),
      state: get(r, 'state').toUpperCase(),
    };
  });
}

// ---- Classification --------------------------------------------------------

const SAVINGS_PRODUCT = /saving|deposit|pocket|vault/i;
const SAVINGS_DESC = /\b(savings?|pocket|vault|round[- ]?up)\b/i;
const STATE_REASON = { PENDING: 'Pending (not completed yet)', REVERTED: 'Reverted', DECLINED: 'Declined', FAILED: 'Failed' };

/**
 * Decide what to do with a row. Returns { reason } to exclude, or
 * { kind: 'expense' | 'refund', cost } where cost is the money it cost me in
 * cents (fee included; negative for refunds).
 */
export function classify(row, { currency = 'EUR', selfNames = [] } = {}) {
  const type = row.type.toUpperCase();
  if (!Number.isFinite(row.amount)) return { reason: 'Unreadable amount' };
  if (row.state !== 'COMPLETED') return { reason: STATE_REASON[row.state] ?? `Not completed (${row.state.toLowerCase()})` };
  if (row.currency !== currency) return { reason: `${row.currency} account (only ${currency} is tracked)` };
  if (/TOP.?UP/.test(type)) return { reason: 'Top-up' };
  if (type === 'EXCHANGE') return { reason: 'Currency exchange between your accounts' };
  if (SAVINGS_PRODUCT.test(row.product) || (type === 'TRANSFER' && SAVINGS_DESC.test(row.description))) return { reason: 'Savings / pocket movement' };
  if (type === 'TRANSFER' && isSelfTransfer(row.description, selfNames)) return { reason: 'Transfer to your own account' };
  if (type === 'ATM') return { reason: 'Cash withdrawal (log cash spending with +)' };

  const cost = -row.amount + (row.fee || 0);
  if (row.amount > 0) {
    if (/REFUND/.test(type) || type === 'CARD PAYMENT') return { kind: 'refund', cost };
    return { reason: 'Money in (not spending)' };
  }
  if (cost <= 0) return { reason: 'Zero amount' };
  return { kind: 'expense', cost };
}

function isSelfTransfer(description, selfNames) {
  const d = normalize(description).replace(/^(TO|FROM) /, '');
  return selfNames.some((n) => normalize(n) && d === normalize(n));
}

/** Stable identity of a row; `n` separates genuinely identical rows in one file. */
export function fingerprint(row, n) {
  return `revolut|${row.started}|${row.amount}|${row.fee}|${normalize(row.description)}|${n}`;
}

// ---- The whole pipeline ----------------------------------------------------

const DAY = 86_400_000;
const daysApart = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY;

/**
 * existing: all stored transactions; rules: category rules.
 * opts: { periodStart, periodEnd, currency, selfNames, defaultCounterpart, batchId, newId, now }
 * Returns { add, link, summary } — `link` are planned/manual transactions
 * confirmed by a CSV row (they get its fingerprint, nothing is duplicated).
 */
export function planImport(text, existing, rules, opts) {
  const rows = readRevolut(text);
  const known = new Set(existing.map((t) => t.fingerprint).filter(Boolean));
  const seen = new Map();
  const unlinkedPlans = existing.filter((t) => (t.source === 'plan' || t.source === 'manual') && t.kind !== 'settlement' && !t.fingerprint && t.amount > 0);
  const add = [], link = [], excluded = [];
  let duplicates = 0;

  for (const row of rows) {
    const base = `${row.started}|${row.amount}|${row.description}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const fp = fingerprint(row, n);
    if (known.has(fp)) { duplicates++; continue; }

    const c = classify(row, opts);
    if (c.reason) { excluded.push({ row, reason: c.reason }); continue; }

    // Already entered by hand / from the plan? Confirm it instead of adding.
    if (c.kind === 'expense') {
      const i = unlinkedPlans.findIndex((t) => t.amount === c.cost && daysApart(t.date, row.date) <= 3);
      if (i >= 0) {
        const [planned] = unlinkedPlans.splice(i, 1);
        link.push({ ...planned, fingerprint: fp, importBatchId: opts.batchId, updatedAt: opts.now });
        continue;
      }
    }
    if (row.date < opts.periodStart || row.date > opts.periodEnd) { excluded.push({ row, reason: 'Outside the exchange period' }); continue; }

    const rule = matchRule(row.description, rules);
    const tx = {
      id: opts.newId(),
      source: 'revolut', externalId: null, fingerprint: fp, importBatchId: opts.batchId,
      kind: c.kind, date: row.date, time: row.time,
      description: row.description, note: '',
      amount: c.cost, fee: row.fee || 0, origAmount: null, origCurrency: null,
      categoryId: rule?.categoryId ?? null,
      spread: null, refundOf: null,
      createdAt: opts.now, updatedAt: opts.now,
      ...computeSplit({ amount: c.cost, mode: rule?.split ?? 'mine', counterpartId: opts.defaultCounterpart }),
    };

    if (c.kind === 'refund') {
      // Take category and split from the original purchase (same merchant, ≤ 60 days before).
      const merchant = normalize(row.description);
      const original = [...add, ...existing]
        .filter((t) => t.amount > 0 && normalize(t.description) === merchant && t.date <= row.date && daysApart(t.date, row.date) <= 60)
        .sort((a, b) => Math.abs(a.amount + c.cost) - Math.abs(b.amount + c.cost) || b.date.localeCompare(a.date))[0];
      if (original) {
        tx.refundOf = original.id;
        tx.categoryId = original.categoryId;
        const share = original.amount ? Math.round((original.myShare * c.cost) / original.amount) : c.cost;
        Object.assign(tx, computeSplit({ amount: c.cost, mode: original.splitMode, customShare: share, counterpartId: original.counterpartId ?? opts.defaultCounterpart }));
      }
    }
    add.push(tx);
  }

  return {
    add, link,
    summary: {
      rows: rows.length,
      added: add.length,
      linked: link.length,
      duplicates,
      excluded,
      uncategorized: add.filter((t) => !t.categoryId).length,
    },
  };
}
