import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchRule, normalize } from '../js/rules.js';

const rules = [
  { id: 1, keyword: 'UBER', categoryId: 'transport' },
  { id: 2, keyword: 'UBER EATS', categoryId: 'eating' },
  { id: 3, keyword: 'BAR', categoryId: 'coffee' },
  { id: 4, keyword: 'BARBER', categoryId: 'health' },
  { id: 5, keyword: 'Café', categoryId: 'coffee' },
  { id: 6, keyword: 'MONOPRIX', categoryId: 'groceries' },
];
const cat = (d) => matchRule(d, rules)?.categoryId ?? null;

test('normalize strips accents, case and punctuation', () => {
  assert.equal(normalize("Vélib' Métropole"), 'VELIB METROPOLE');
});

test('longest keyword wins', () => {
  assert.equal(cat('Uber Eats Paris'), 'eating');
  assert.equal(cat('UBER *TRIP HELP.UBER.COM'), 'transport');
});

test('whole words only', () => {
  assert.equal(cat('Le Bar du Marché'), 'coffee');
  assert.equal(cat('Barber Shop Oberkampf'), 'health');
  assert.equal(cat('Barbès Pharmacie'), null);
});

test('accent-insensitive and case-insensitive', () => {
  assert.equal(cat('CAFE DE FLORE'), 'coffee');
  assert.equal(cat('monoprix paris 11'), 'groceries');
});

test('no match returns null', () => {
  assert.equal(cat('Some Unknown Merchant'), null);
});
