// First-run defaults. Written once (guarded by meta.seedVersion); after that
// everything is the user's to edit, and seeding never overwrites changes.

import * as db from './db.js';
import { ME } from './people.js';

const SEED_VERSION = 2;

// v1 → v2: the original category colours failed the colour-blind checks.
const V1_COLORS = {"rent": "#7B61D9", "groceries": "#0E9384", "eating": "#E0631A", "coffee": "#A8742F", "transport": "#1D8CC4", "travel": "#B54BC8", "leisure": "#D9467A", "shopping": "#B58A00", "health": "#5C7ED6", "subs": "#6E7A8A"};

// [id, name, emoji, colour (matches --cat-N in tokens.css), type, keywords]
const CATEGORIES = [
  ['rent', 'Rent & housing', '🏠', '#B964DD', 'fixed',
    ['AIRBNB', 'EDF', 'ENGIE', 'TOTALENERGIES', 'IKEA', 'CASTORAMA', 'LEROY MERLIN']],
  ['groceries', 'Groceries', '🛒', '#1AA598', 'variable',
    ['MONOPRIX', 'CARREFOUR', 'FRANPRIX', 'LIDL', 'PICARD', 'NATURALIA', 'G20', 'AUCHAN', 'INTERMARCHE', 'BIOCOOP', 'CASINO', 'ALDI', 'LA GRANDE EPICERIE']],
  ['eating', 'Eating out', '🍽️', '#A29015', 'variable',
    ['DELIVEROO', 'UBER EATS', 'JUST EAT', 'RESTAURANT', 'PIZZERIA', 'BRASSERIE', 'BISTROT', 'MCDONALD S', 'BURGER KING', 'KFC', 'SUSHI', 'BIG MAMMA']],
  ['coffee', 'Coffee & bars', '☕', '#A74F21', 'variable',
    ['CAFE', 'COFFEE', 'STARBUCKS', 'BOULANGERIE', 'BAR', 'PUB', 'BRIOCHE DOREE', 'BOULANGER']],
  ['transport', 'Transport', '🚇', '#5096CE', 'variable',
    ['RATP', 'NAVIGO', 'VELIB', 'UBER', 'BOLT', 'SNCF', 'TRANSILIEN', 'LIME', 'DOTT', 'G7', 'HEETCH']],
  ['travel', 'Travel & weekends', '✈️', '#8A48B3', 'variable',
    ['RYANAIR', 'EASYJET', 'AIR FRANCE', 'VUELING', 'TRANSAVIA', 'WIZZ AIR', 'ITA AIRWAYS', 'TRAINLINE', 'OUIGO', 'FLIXBUS', 'BLABLACAR', 'BOOKING COM', 'HOTEL', 'EUROSTAR', 'TRENITALIA']],
  ['leisure', 'Leisure & culture', '🎭', '#E25295', 'variable',
    ['MUSEE', 'LOUVRE', 'ORSAY', 'CINEMA', 'UGC', 'PATHE', 'MK2', 'TICKETMASTER', 'FNAC SPECTACLES', 'DICE', 'SHOTGUN', 'THEATRE', 'CONCERT']],
  ['shopping', 'Shopping', '🛍️', '#7B6C01', 'variable',
    ['AMAZON', 'FNAC', 'DARTY', 'ZARA', 'H M', 'UNIQLO', 'DECATHLON', 'SEPHORA', 'GALERIES LAFAYETTE', 'PRINTEMPS', 'BHV', 'APPLE STORE', 'VINTED']],
  ['health', 'Health & personal care', '💊', '#0975A2', 'variable',
    ['PHARMACIE', 'DOCTOLIB', 'MEDECIN', 'DENTISTE', 'BASIC FIT', 'FITNESS PARK', 'COIFFEUR', 'BARBER', 'OPTICIEN']],
  ['subs', 'Subscriptions & phone', '📱', '#7C7BFF', 'fixed',
    ['SPOTIFY', 'NETFLIX', 'APPLE COM BILL', 'ICLOUD', 'DISNEY PLUS', 'AMAZON PRIME', 'FREE MOBILE', 'SFR', 'ORANGE', 'BOUYGUES', 'YOUTUBE', 'CHATGPT', 'OPENAI']],
];

const PEOPLE = [
  { id: ME, name: 'Me' },
  { id: 'partner', name: 'Partner' },   // renamed in the app; real names never live in the repo
];

export async function ensureSeeded() {
  const meta = await db.get('meta', 'seedVersion');
  if (meta?.value >= SEED_VERSION) return false;
  if (meta?.value === 1) return upgradeColors();

  const categories = CATEGORIES.map(([id, name, emoji, color, type], order) => ({
    id, name, emoji, color, type, order, budget: 0, archived: false,
  }));
  const rules = CATEGORIES.flatMap(([categoryId, , , , , keywords]) =>
    keywords.map((keyword) => ({ id: db.uid(), keyword, categoryId, split: null })));

  await db.batch({
    categories: { put: categories },
    rules: { put: rules },
    people: { put: PEOPLE },
    settings: { put: [{ key: 'defaultCounterpart', value: 'partner' }] },
    meta: { put: [{ key: 'seedVersion', value: SEED_VERSION }] },
  });
  return true;
}

/** Swap in the validated palette, but only where the user kept the old default. */
async function upgradeColors() {
  const byId = Object.fromEntries(CATEGORIES.map(([id, , , color]) => [id, color]));
  const cats = await db.getAll('categories');
  const changed = cats
    .filter((c) => V1_COLORS[c.id] && c.color.toUpperCase() === V1_COLORS[c.id])
    .map((c) => ({ ...c, color: byId[c.id] }));
  await db.batch({ categories: { put: changed }, meta: { put: [{ key: 'seedVersion', value: SEED_VERSION }] } });
  return true;
}
