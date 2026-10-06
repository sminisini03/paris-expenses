// Categories: list, edit, reorder, archive, delete-with-reassign.
// Every chart, budget and filter reads this list, so a new category shows up
// everywhere immediately.

import * as db from './db.js';

export const UNCATEGORIZED = null;   // the inbox is "no category", not a category

export async function listCategories({ includeArchived = false } = {}) {
  const all = await db.getAll('categories');
  return all
    .filter((c) => includeArchived || !c.archived)
    .sort((a, b) => a.order - b.order);
}

export async function saveCategory(cat) {
  const all = await db.getAll('categories');
  const value = {
    type: 'variable', budget: 0, archived: false, emoji: '🏷️',
    order: all.length ? Math.max(...all.map((c) => c.order)) + 1 : 0,
    ...cat,
    id: cat.id ?? db.uid(),
    name: cat.name.trim(),
  };
  await db.put('categories', value);
  db.emitDataChange();
  return value;
}

/** Swap with the neighbour among *active* categories. dir = -1 (up) | 1 (down). */
export async function moveCategory(id, dir) {
  const list = await listCategories();
  const i = list.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  const [a, b] = [list[i], list[j]];
  [a.order, b.order] = [b.order, a.order];
  await db.batch({ categories: { put: [a, b] } });
  db.emitDataChange();
}

export async function countTransactions(categoryId) {
  return (await db.getAllByIndex('transactions', 'categoryId', categoryId)).length;
}

export async function setArchived(id, archived) {
  const cat = await db.get('categories', id);
  await db.put('categories', { ...cat, archived });
  db.emitDataChange();
}

/**
 * Delete a category. If it has transactions they must be moved first:
 * pass reassignTo (a category id, or null for the inbox). Rules pointing at
 * it are moved along (or removed when going to the inbox).
 */
export async function deleteCategory(id, { reassignTo } = {}) {
  const txs = await db.getAllByIndex('transactions', 'categoryId', id);
  if (txs.length && reassignTo === undefined) throw new Error('Category has transactions; reassign them first.');
  const rules = (await db.getAll('rules')).filter((r) => r.categoryId === id);
  await db.batch({
    categories: { del: [id] },
    transactions: { put: txs.map((t) => ({ ...t, categoryId: reassignTo, updatedAt: new Date().toISOString() })) },
    rules: reassignTo
      ? { put: rules.map((r) => ({ ...r, categoryId: reassignTo })) }
      : { del: rules.map((r) => r.id) },
  });
  db.emitDataChange();
}
