// App settings: defaults, load/save in IndexedDB, and applying the look.

import * as db from './db.js';
import { configureFormat } from './format.js';

export const DEFAULTS = {
  theme: 'system',            // 'system' | 'light' | 'dark'
  accent: '#2F5BEA',
  numberLocale: 'de-AT',      // → € 1.234,56
  currency: 'EUR',
  periodStart: '2026-10-07',
  periodEnd: '2027-01-31',
  defaultCounterpart: 'partner', // who "Shared" splits with by default
  selfNames: '',              // your name(s) as shown on Revolut transfers, comma-separated
  amountView: 'mine',         // 'mine' (my share) | 'total' (full amount paid) for budgets & charts
  chartsIncludeFixed: true,   // include Fixed categories (rent, subscriptions) in charts
};

export const ACCENT_PRESETS = ['#2F5BEA', '#0E9384', '#7B61D9', '#D9467A', '#E0631A', '#18181B'];

const current = { ...DEFAULTS };

export const settings = () => current;

export async function loadSettings() {
  const rows = await db.getAll('settings');
  for (const { key, value } of rows) current[key] = value;
  apply();
  return current;
}

export async function setSetting(key, value) {
  current[key] = value;
  await db.put('settings', { key, value });
  apply();
  window.dispatchEvent(new CustomEvent('settingschange', { detail: { key, value } }));
}

function apply() {
  const root = document.documentElement;
  if (current.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = current.theme;

  root.style.setProperty('--accent', current.accent);
  root.style.setProperty('--accent-contrast', contrastText(current.accent));
  // Accent used as text must stay AA-readable (4.5:1) for ANY chosen accent,
  // on plain surfaces and on the 12% accent tint, in both themes.
  const textLight = readableAccent(current.accent, ['#FFFFFF', '#F7F7F8'], '#000000');
  const textDark = readableAccent(current.accent, ['#18181B', '#0E0E10'], '#FFFFFF');
  root.style.setProperty('--accent-text-light', textLight);
  root.style.setProperty('--accent-text-dark', textDark);
  configureFormat(current);

  // Mirror the look in localStorage so index.html can apply it before first
  // paint (IndexedDB is async and would cause a flash). Not a source of truth.
  try {
    localStorage.setItem('pe.theme', JSON.stringify({ theme: current.theme, accent: current.accent, textLight, textDark }));
  } catch { /* private mode: fine, only costs a flash */ }
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const luminance = (c) => {
  const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/**
 * Shift the accent towards black (light theme) or white (dark theme) until it
 * reaches 4.5:1 on each background and on the accent tint over it.
 */
export function readableAccent(accent, backgrounds, towards) {
  const a = rgb(accent), dir = rgb(towards);
  const bgs = backgrounds.flatMap((bg) => [rgb(bg), mix(rgb(bg), a, 0.12)]);
  for (let t = 0; t <= 1; t += 0.02) {
    const c = mix(a, dir, t);
    if (bgs.every((bg) => ratio(c, bg) >= 4.6)) return toHex(c);
  }
  return towards;
}

/** White or near-black, whichever is more readable on the given colour. */
export function contrastText(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.05) ? '#FFFFFF' : '#18181B';
}
