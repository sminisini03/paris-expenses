// People you split with. "Me" always exists and can be renamed but not removed.

import * as db from './db.js';

export const ME = 'me';

export async function listPeople() {
  const all = await db.getAll('people');
  return all.sort((a, b) => (a.id === ME ? -1 : b.id === ME ? 1 : a.name.localeCompare(b.name)));
}

export async function savePerson(person) {
  const value = { ...person, id: person.id ?? db.uid(), name: person.name.trim() };
  await db.put('people', value);
  db.emitDataChange();
  return value;
}

export async function countTransactionsWith(personId) {
  return (await db.getAll('transactions')).filter((t) => t.counterpartId === personId).length;
}

export async function deletePerson(id) {
  if (id === ME) throw new Error('"Me" cannot be removed.');
  if (await countTransactionsWith(id)) throw new Error('This person has shared expenses; they can only be renamed.');
  await db.del('people', id);
  db.emitDataChange();
}
