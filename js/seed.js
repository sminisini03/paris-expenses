// First-run defaults. Written once (guarded by meta.seedVersion); after that
// everything is the user's to edit, and seeding never overwrites changes.

import * as db from './db.js';
import { ME } from './people.js';

const SEED_VERSION = 1;

// [id, name, emoji, colour (matches --cat-N in tokens.css), type, keywords]
const CATEGORIES = [
  ['rent', 'Rent & housing', '🏠', '#7B61D9', 'fixed',
    ['AIRBNB', 'EDF', 'ENGIE', 'TOTALENERGIES', 'IKEA', 'CASTORAMA', 'LEROY MERLIN']],
  ['groceries', 'Groceries', '🛒', '#0E9384', 'variable',
    ['MONOPRIX', 'CARREFOUR', 'FRANPRIX', 'LIDL', 'PICARD', 'NATURALIA', 'G20', 'AUCHAN', 'INTERMARCHE', 'BIOCOOP', 'CASINO', 'ALDI', 'LA GRANDE EPICERIE']],
  ['eating', 'Eating out', '🍽️', '#E0631A', 'variable',
    ['DELIVEROO', 'UBER EATS', 'JUST EAT', 'RESTAURANT', 'PIZZERIA', 'BRASSERIE', 'BISTROT', 'MCDONALD S', 'BURGER KING', 'KFC', 'SUSHI', 'BIG MAMMA']],
  ['coffee', 'Coffee & bars', '☕', '#A8742F', 'variable',
    ['CAFE', 'COFFEE', 'STARBUCKS', 'BOULANGERIE', 'BAR', 'PUB', 'BRIOCHE DOREE', 'BOULANGER']],
  ['transport', 'Transport', '🚇', '#1D8CC4', 'variable',
    ['RATP', 'NAVIGO', 'VELIB', 'UBER', 'BOLT', 'SNCF', 'TRANSILIEN', 'LIME', 'DOTT', 'G7', 'HEETCH']],
  ['travel', 'Travel & weekends', '✈️', '#B54BC8', 'variable',
    ['RYANAIR', 'EASYJET', 'AIR FRANCE', 'VUELING', 'TRANSAVIA', 'WIZZ AIR', 'ITA AIRWAYS', 'TRAINLINE', 'OUIGO', 'FLIXBUS', 'BLABLACAR', 'BOOKING COM', 'HOTEL', 'EUROSTAR', 'TRENITALIA']],
  ['leisure', 'Leisure & culture', '🎭', '#D9467A', 'variable',
    ['MUSEE', 'LOUVRE', 'ORSAY', 'CINEMA', 'UGC', 'PATHE', 'MK2', 'TICKETMASTER', 'FNAC SPECTACLES', 'DICE', 'SHOTGUN', 'THEATRE', 'CONCERT']],
  ['shopping', 'Shopping', '🛍️', '#B58A00', 'variable',
    ['AMAZON', 'FNAC', 'DARTY', 'ZARA', 'H M', 'UNIQLO', 'DECATHLON', 'SEPHORA', 'GALERIES LAFAYETTE', 'PRINTEMPS', 'BHV', 'APPLE STORE', 'VINTED']],
  ['health', 'Health & personal care', '💊', '#5C7ED6', 'variable',
    ['PHARMACIE', 'DOCTOLIB', 'MEDECIN', 'DENTISTE', 'BASIC FIT', 'FITNESS PARK', 'COIFFEUR', 'BARBER', 'OPTICIEN']],
  ['subs', 'Subscriptions & phone', '📱', '#6E7A8A', 'fixed',
    ['SPOTIFY', 'NETFLIX', 'APPLE COM BILL', 'ICLOUD', 'DISNEY PLUS', 'AMAZON PRIME', 'FREE MOBILE', 'SFR', 'ORANGE', 'BOUYGUES', 'YOUTUBE', 'CHATGPT', 'OPENAI']],
];

const PEOPLE = [
  { id: ME, name: 'Me' },
  { id: 'partner', name: 'Partner' },   // renamed in the app; real names never live in the repo
];

export async function ensureSeeded() {
  const meta = await db.get('meta', 'seedVersion');
  if (meta?.value >= SEED_VERSION) return false;

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
