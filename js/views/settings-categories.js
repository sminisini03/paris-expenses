// Settings → Categories: add / edit / recolour / reorder / archive / delete.

import { h, icon, pageHeader, backLink, segmented, colorPicker, field, openDialog, confirmDialog, fieldError, toast } from '../ui.js';
import { listCategories, saveCategory, moveCategory, setArchived, deleteCategory, countTransactions } from '../categories.js';
import { money, parseAmount, centsToInput } from '../format.js';

/** Default palette straight from tokens.css (--cat-1 … --cat-10). */
export function categoryPalette() {
  const cs = getComputedStyle(document.documentElement);
  return Array.from({ length: 10 }, (_, i) => cs.getPropertyValue(`--cat-${i + 1}`).trim().toUpperCase());
}

function typeLabel(c) { return c.type === 'fixed' ? 'Fixed' : 'Variable'; }

export function openCategoryEditor(cat, allCategories) {
  const isNew = !cat;
  const used = new Set(allCategories.map((c) => c.color.toUpperCase()));
  const palette = categoryPalette();
  const draft = cat
    ? { ...cat }
    : { name: '', emoji: '🏷️', color: palette.find((p) => !used.has(p)) ?? palette[0], type: 'variable', budget: 0 };

  const name = h('input', { class: 'input', type: 'text', value: draft.name, autocomplete: 'off', required: true, maxlength: '40', enterkeyhint: 'done' });
  const emoji = h('input', { class: 'input input--emoji', type: 'text', value: draft.emoji, maxlength: '8', autocomplete: 'off', 'aria-describedby': 'cat-emoji-hint' });
  const budget = h('input', { class: 'input amount', type: 'text', inputmode: 'decimal', value: draft.budget ? centsToInput(draft.budget) : '', placeholder: '0,00', autocomplete: 'off' });

  const content = h('div', { class: 'form' },
    h('div', { class: 'form-row' }, field('cat-emoji', 'Icon', emoji), field('cat-name', 'Name', name)),
    h('p', { class: 'small muted', id: 'cat-emoji-hint', style: { marginTop: 'calc(-1 * var(--s-1))' } }, 'Tip: use the emoji keyboard for the icon.'),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Colour'),
      colorPicker('cat-color', 'Colour', palette, draft.color, (hex) => { draft.color = hex; })),
    h('div', { class: 'field' }, h('span', { class: 'label', id: 'cat-type-label' }, 'Type'),
      segmented('cat-type', 'Type', [['variable', 'Variable'], ['fixed', 'Fixed']], draft.type, (v) => { draft.type = v; }),
      h('p', { class: 'small muted' }, 'Fixed costs (rent, phone) are counted separately in projections.')),
    field('cat-budget', 'Monthly budget', budget, 'Leave empty for no budget.'),
    !isNew && h('div', { class: 'danger-zone' },
      h('button', { class: 'btn', type: 'button', onclick: async () => {
        await setArchived(cat.id, !cat.archived);
        toast(cat.archived ? `${cat.name} restored.` : `${cat.name} archived. Its expenses are kept.`);
        dlg.close();
      } }, cat.archived ? 'Restore' : 'Archive'),
      h('button', { class: 'btn btn--danger', type: 'button', onclick: () => { dlg.close(); deleteFlow(cat, allCategories); } }, 'Delete…'),
    ),
  );

  const dlg = openDialog({
    title: isNew ? 'New category' : 'Edit category',
    content,
    actions: [
      { label: 'Cancel' },
      { label: isNew ? 'Add category' : 'Save', variant: 'primary', onClick: async () => {
        const n = name.value.trim();
        if (!n) { fieldError(name, 'Give the category a name.'); return false; }
        if (allCategories.some((c) => c.id !== cat?.id && c.name.toLowerCase() === n.toLowerCase())) {
          fieldError(name, 'A category with this name already exists.'); return false;
        }
        const cents = budget.value.trim() ? parseAmount(budget.value) : 0;
        if (cents == null || cents < 0) { fieldError(budget, 'Enter an amount like 250 or 250,50.'); return false; }
        await saveCategory({ ...draft, name: n, emoji: emoji.value.trim() || '🏷️', budget: cents });
        toast(isNew ? `${n} added.` : 'Saved.');
      } },
    ],
  });
  if (isNew) name.focus();
}

async function deleteFlow(cat, allCategories) {
  const count = await countTransactions(cat.id);
  if (count === 0) {
    if (await confirmDialog(`Delete ${cat.name}?`, 'It has no expenses. Its keyword rules are removed too.', 'Delete', { danger: true })) {
      await deleteCategory(cat.id, { reassignTo: null });
      toast(`${cat.name} deleted.`);
    }
    return;
  }
  // Has expenses: never delete silently. Move them first, or archive instead.
  const target = h('select', { class: 'select' },
    allCategories.filter((c) => c.id !== cat.id && !c.archived).map((c) => h('option', { value: c.id }, `${c.emoji} ${c.name}`)),
    h('option', { value: '' }, 'Inbox (uncategorised)'),
  );
  openDialog({
    title: `Delete ${cat.name}?`,
    content: h('div', { class: 'form' },
      h('p', {}, `${count} expense${count === 1 ? '' : 's'} use this category. Move them first, or archive the category to keep it on old expenses but hide it from pickers.`),
      field('cat-reassign', `Move ${count} expense${count === 1 ? '' : 's'} to`, target),
    ),
    actions: [
      { label: 'Archive instead', onClick: async () => { await setArchived(cat.id, true); toast(`${cat.name} archived.`); } },
      { label: 'Move and delete', variant: 'primary', onClick: async () => {
        await deleteCategory(cat.id, { reassignTo: target.value || null });
        toast(`${cat.name} deleted. ${count} expense${count === 1 ? '' : 's'} moved.`);
      } },
    ],
  });
}

function categoryRow(c, i, list, all) {
  return h('li', { class: 'row' },
    h('button', { class: 'row__btn', type: 'button', 'data-key': `cat-${c.id}`, onclick: () => openCategoryEditor(c, all) },
      h('span', { class: 'dot', style: { '--dot': c.color } }),
      h('span', { class: 'row__lead', 'aria-hidden': 'true' }, c.emoji),
      h('span', { class: 'row__main' },
        h('span', { class: 'row__title', style: { display: 'block' } }, c.name),
        h('span', { class: 'row__hint', style: { display: 'block' } }, `${typeLabel(c)} · ${c.budget ? `${money(c.budget)} / month` : 'No budget'}`),
      ),
    ),
    !c.archived && h('span', { class: 'row__actions' },
      h('button', { class: 'icon-btn', type: 'button', 'data-key': `up-${c.id}`, 'aria-label': `Move ${c.name} up`, disabled: i === 0, onclick: () => moveCategory(c.id, -1) }, icon('up')),
      h('button', { class: 'icon-btn', type: 'button', 'data-key': `down-${c.id}`, 'aria-label': `Move ${c.name} down`, disabled: i === list.length - 1, onclick: () => moveCategory(c.id, 1) }, icon('down')),
    ),
  );
}

export async function render(main) {
  const all = await listCategories({ includeArchived: true });
  const active = all.filter((c) => !c.archived);
  const archived = all.filter((c) => c.archived);
  const totalBudget = active.reduce((s, c) => s + (c.budget || 0), 0);

  main.append(
    backLink('#/settings', 'Settings'),
    pageHeader('Categories', `${active.length} active · ${money(totalBudget)} budgeted per month`,
      h('button', { class: 'btn btn--primary', type: 'button', 'data-key': 'add-category', onclick: () => openCategoryEditor(null, all) }, icon('plus'), 'Add')),
    h('ul', { class: 'list' }, active.map((c, i) => categoryRow(c, i, active, all))),
    ...(archived.length ? [
      h('h2', { class: 'section-title' }, 'Archived'),
      h('ul', { class: 'list' }, archived.map((c, i) => categoryRow(c, i, archived, all))),
    ] : []),
  );
}
