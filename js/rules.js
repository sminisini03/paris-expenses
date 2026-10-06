// Category rules: keyword → category (+ optional default split).
// Matching is accent- and case-insensitive and works on whole words, so
// "BAR" matches "BAR DU MARCHE" but not "BARBER". When several rules match,
// the longest keyword wins ("UBER EATS" beats "UBER").

import * as db from './db.js';
import { emitDataChange } from './db.js';

export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // strip accents
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/** Pure: returns the best-matching rule for a description, or null. */
export function matchRule(description, rules) {
  const hay = ` ${normalize(description)} `;
  let best = null;
  for (const rule of rules) {
    const kw = normalize(rule.keyword);
    if (!kw || !hay.includes(` ${kw} `)) continue;
    if (!best || kw.length > normalize(best.keyword).length) best = rule;
  }
  return best;
}

export async function listRules() {
  const rules = await db.getAll('rules');
  return rules.sort((a, b) => normalize(a.keyword).localeCompare(normalize(b.keyword)));
}

export async function saveRule(rule) {
  const value = { split: null, ...rule, id: rule.id ?? db.uid(), keyword: rule.keyword.trim() };
  await db.put('rules', value);
  emitDataChange();
  return value;
}

export async function deleteRule(id) {
  await db.del('rules', id);
  emitDataChange();
}

/** Used by "Always categorise like this": updates an existing rule for the same keyword or adds one. */
export async function upsertRuleForKeyword(keyword, categoryId, split = null) {
  const existing = (await db.getAll('rules')).find((r) => normalize(r.keyword) === normalize(keyword));
  return saveRule({ ...existing, keyword, categoryId, split: split ?? existing?.split ?? null });
}
