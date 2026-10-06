// Settings → Category rules: keyword → category (+ optional default split).

import { h, icon, pageHeader, backLink, field, openDialog, confirmDialog, fieldError, toast } from '../ui.js';
import { listRules, saveRule, deleteRule, normalize } from '../rules.js';
import { listCategories } from '../categories.js';

export const SPLIT_PRESETS = [
  ['', 'No default'],
  ['mine', 'Mine (100%)'],
  ['shared', 'Shared 50/50'],
  ['theirs', 'Theirs (they owe me all)'],
];

function openRuleEditor(rule, rules, categories, defaults = {}) {
  const isNew = !rule;
  const keyword = h('input', { class: 'input', type: 'text', value: rule?.keyword ?? defaults.keyword ?? '', autocomplete: 'off', autocapitalize: 'characters', required: true });
  const category = h('select', { class: 'select' },
    categories.map((c) => h('option', { value: c.id, selected: c.id === (rule?.categoryId ?? defaults.categoryId) }, `${c.emoji} ${c.name}`)));
  const split = h('select', { class: 'select' },
    SPLIT_PRESETS.map(([v, t]) => h('option', { value: v, selected: v === (rule?.split ?? '') }, t)));

  openDialog({
    title: isNew ? 'New rule' : 'Edit rule',
    content: h('div', { class: 'form' },
      field('rule-keyword', 'When the description contains', keyword, 'Whole words, ignoring case and accents. E.g. MONOPRIX, UBER EATS.'),
      field('rule-category', 'Categorise as', category),
      field('rule-split', 'Default split', split, 'Applied to imported expenses that match.'),
      !isNew && h('div', { class: 'danger-zone' },
        h('button', { class: 'btn btn--danger', type: 'button', onclick: async (e) => {
          e.target.closest('dialog').close();
          if (await confirmDialog('Delete rule?', `"${rule.keyword}" will no longer categorise expenses automatically.`, 'Delete', { danger: true })) {
            await deleteRule(rule.id);
            toast('Rule deleted.');
          }
        } }, 'Delete rule'),
      ),
    ),
    actions: [
      { label: 'Cancel' },
      { label: isNew ? 'Add rule' : 'Save', variant: 'primary', onClick: async () => {
        const kw = keyword.value.trim();
        if (!normalize(kw)) { fieldError(keyword, 'Enter a keyword.'); return false; }
        const dupe = rules.find((r) => r.id !== rule?.id && normalize(r.keyword) === normalize(kw));
        if (dupe) { fieldError(keyword, 'There is already a rule for this keyword.'); return false; }
        await saveRule({ ...rule, keyword: kw.toUpperCase(), categoryId: category.value, split: split.value || null });
        toast(isNew ? 'Rule added.' : 'Saved.');
      } },
    ],
  });
  if (isNew) keyword.focus();
}

let query = '';   // survives redraws while on this screen

export async function render(main) {
  const [rules, categories] = await Promise.all([listRules(), listCategories()]);
  const byId = Object.fromEntries(categories.map((c) => [c.id, c]));
  const splitText = Object.fromEntries(SPLIT_PRESETS);

  const list = h('ul', { class: 'list' });
  const empty = h('p', { class: 'small muted', style: { padding: 'var(--s-2)' }, hidden: true }, 'No rules match.');
  const draw = () => {
    const q = normalize(query);
    const shown = rules.filter((r) => !q || normalize(r.keyword).includes(q) || normalize(byId[r.categoryId]?.name).includes(q));
    list.replaceChildren(...shown.map((r) => {
      const c = byId[r.categoryId];
      return h('li', {}, h('button', { class: 'row row__btn', style: { padding: 'var(--s-1) var(--s-2)', width: '100%' }, type: 'button', 'data-key': `rule-${r.id}`, onclick: () => openRuleEditor(r, rules, categories) },
        h('span', { class: 'dot', style: { '--dot': c?.color } }),
        h('span', { class: 'row__main' },
          h('span', { class: 'row__title', style: { display: 'block' } }, r.keyword),
          h('span', { class: 'row__hint', style: { display: 'block' } }, c ? `${c.emoji} ${c.name}` : 'Archived category', r.split ? ` · ${splitText[r.split]}` : ''),
        ),
        icon('chevronRight'),
      ));
    }));
    list.hidden = shown.length === 0;
    empty.hidden = shown.length > 0;
  };

  const search = h('input', {
    class: 'input', type: 'search', placeholder: 'Search keywords or categories', value: query, 'aria-label': 'Search rules',
    oninput: (e) => { query = e.target.value; draw(); },
  });
  draw();

  main.append(
    backLink('#/settings', 'Settings'),
    pageHeader('Category rules', `${rules.length} rules · imported expenses matching a keyword are categorised automatically`,
      h('button', { class: 'btn btn--primary', type: 'button', 'data-key': 'add-rule', onclick: () => openRuleEditor(null, rules, categories) }, icon('plus'), 'Add')),
    h('div', { class: 'toolbar' }, search),
    list, empty,
  );
}
