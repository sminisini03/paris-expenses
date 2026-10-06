// Settings → People you split with.

import { h, icon, pageHeader, backLink, field, openDialog, confirmDialog, fieldError, toast } from '../ui.js';
import { listPeople, savePerson, deletePerson, countTransactionsWith, ME } from '../people.js';
import { settings, setSetting } from '../settings.js';

function openPersonEditor(person, people) {
  const isNew = !person;
  const name = h('input', { class: 'input', type: 'text', value: person?.name ?? '', autocomplete: 'off', required: true, maxlength: '30' });
  openDialog({
    title: isNew ? 'Add person' : person.id === ME ? 'Your name' : 'Edit person',
    content: h('div', { class: 'form' },
      field('person-name', 'Name', name),
      !isNew && person.id !== ME && h('div', { class: 'danger-zone' },
        h('button', { class: 'btn btn--danger', type: 'button', onclick: async (e) => {
          e.target.closest('dialog').close();
          if (await countTransactionsWith(person.id)) {
            toast(`${person.name} has shared expenses, so they can only be renamed.`);
            return;
          }
          if (await confirmDialog(`Remove ${person.name}?`, 'They have no shared expenses.', 'Remove', { danger: true })) {
            await deletePerson(person.id);
            if (settings().defaultCounterpart === person.id) await setSetting('defaultCounterpart', people.find((p) => p.id !== ME && p.id !== person.id)?.id ?? null);
            toast(`${person.name} removed.`);
          }
        } }, 'Remove'),
      ),
    ),
    actions: [
      { label: 'Cancel' },
      { label: isNew ? 'Add' : 'Save', variant: 'primary', onClick: async () => {
        const n = name.value.trim();
        if (!n) { fieldError(name, 'Enter a name.'); return false; }
        if (people.some((p) => p.id !== person?.id && p.name.toLowerCase() === n.toLowerCase())) { fieldError(name, 'This name is already used.'); return false; }
        const saved = await savePerson({ ...person, name: n });
        if (!settings().defaultCounterpart) await setSetting('defaultCounterpart', saved.id);
        toast(isNew ? `${n} added.` : 'Saved.');
      } },
    ],
  });
  name.focus();
}

export async function render(main) {
  const people = await listPeople();
  const others = people.filter((p) => p.id !== ME);
  const def = h('select', { class: 'select', onchange: (e) => setSetting('defaultCounterpart', e.target.value) },
    others.map((p) => h('option', { value: p.id, selected: p.id === settings().defaultCounterpart }, p.name)));

  main.append(
    backLink('#/settings', 'Settings'),
    pageHeader('People', 'Who you split expenses with',
      h('button', { class: 'btn btn--primary', type: 'button', 'data-key': 'add-person', onclick: () => openPersonEditor(null, people) }, icon('plus'), 'Add')),
    h('ul', { class: 'list' }, people.map((p) => h('li', {},
      h('button', { class: 'row row__btn', style: { padding: 'var(--s-1) var(--s-2)', width: '100%' }, type: 'button', 'data-key': `person-${p.id}`, onclick: () => openPersonEditor(p, people) },
        h('span', { class: 'row__main' },
          h('span', { class: 'row__title', style: { display: 'block' } }, p.name),
          p.id === ME && h('span', { class: 'row__hint', style: { display: 'block' } }, 'You'),
        ),
        icon('chevronRight'),
      )))),
    ...(others.length ? [
      h('h2', { class: 'section-title' }, 'Defaults'),
      h('ul', { class: 'list' }, h('li', { class: 'row row--stack' }, field('default-counterpart', '"Shared" splits are with', def))),
    ] : []),
  );
}
