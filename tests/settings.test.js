import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readableAccent } from '../js/settings.js';

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('accent text reaches AA in both themes for any accent, incl. light ones', () => {
  for (const accent of ['#2F5BEA', '#0E9384', '#E0631A', '#FFD400', '#18181B', '#7C7BFF']) {
    const light = readableAccent(accent, ['#FFFFFF', '#F7F7F8'], '#000000');
    const dark = readableAccent(accent, ['#18181B', '#0E0E10'], '#FFFFFF');
    assert.ok(ratio(light, '#FFFFFF') >= 4.5, `${accent} light ${light}`);
    assert.ok(ratio(dark, '#18181B') >= 4.5, `${accent} dark ${dark}`);
  }
});
