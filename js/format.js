// Formatting helpers. Amounts are always integer cents internally.
// The number locale only changes how numbers look; dates use one fixed
// English style so month names don't change with the number format.

// Offered in Settings, labelled by what they look like.
export const NUMBER_FORMATS = [
  { locale: 'de-AT', example: '€ 1.234,56' },
  { locale: 'de-DE', example: '1.234,56 €' },
  { locale: 'fr-FR', example: '1 234,56 €' },
  { locale: 'en-IE', example: '€1,234.56' },
];

let numberLocale = 'de-AT';
let currency = 'EUR';
let moneyFmt, moneyFmtWhole;

export function configureFormat({ numberLocale: loc, currency: cur }) {
  numberLocale = loc ?? numberLocale;
  currency = cur ?? currency;
  moneyFmt = new Intl.NumberFormat(numberLocale, { style: 'currency', currency });
  moneyFmtWhole = new Intl.NumberFormat(numberLocale, { style: 'currency', currency, maximumFractionDigits: 0 });
}
configureFormat({});

/** 123456 → "€ 1.234,56". `whole: true` drops the cents (for chart axes). */
export function money(cents, { whole = false } = {}) {
  return (whole ? moneyFmtWhole : moneyFmt).format(cents / 100);
}

export function moneyExample(locale, cur = currency) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: cur }).format(1234.56);
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

/** "2026-10-07" → "7 Oct 2026" */
export function date(iso) {
  return dateFmt.format(new Date(iso.slice(0, 10) + 'T12:00:00'));
}

/** "2026-10" → "October 2026" */
export function month(ym) {
  return monthFmt.format(new Date(ym + '-15T12:00:00'));
}

/**
 * Parse what a person types into integer cents. Accepts both conventions:
 * "1.234,56" · "1234,56" · "1,234.56" · "1234.56" · "12" · "€ 12,5".
 * The last "," or "." followed by 1–2 digits is the decimal separator.
 * Returns null for anything that isn't a number.
 */
export function parseAmount(input) {
  const s = String(input ?? '').replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null;
  const negative = s.startsWith('-');
  const m = s.replace(/-/g, '').match(/^(.*?)(?:[.,](\d{1,2}))?$/);
  const whole = m[1].replace(/[.,]/g, '');
  const frac = (m[2] ?? '').padEnd(2, '0');
  if (!/^\d*$/.test(whole)) return null;
  const cents = Number(whole || '0') * 100 + Number(frac || '0');
  return negative ? -cents : cents;
}

/** Cents → plain editable string in the active locale, without currency ("1234,56"). */
export function centsToInput(cents) {
  return new Intl.NumberFormat(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })
    .format(cents / 100);
}

/** Today as local YYYY-MM-DD (not UTC: matters around midnight). */
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Months (YYYY-MM) touched by a date range, inclusive. */
export function monthsBetween(fromIso, toIso) {
  const out = [];
  let [y, m] = fromIso.slice(0, 7).split('-').map(Number);
  const end = toIso.slice(0, 7);
  for (;;) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    out.push(ym);
    if (ym >= end) return out;
    if (++m > 12) { m = 1; y++; }
  }
}

const dayHeadFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
/** "2026-10-07" → "Wed 7 Oct" */
export function dayHeading(iso) {
  return dayHeadFmt.format(new Date(iso + 'T12:00:00'));
}
