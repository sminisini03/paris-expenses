import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount } from '../js/format.js';

test('parseAmount handles both decimal conventions', () => {
  const cases = {
    '12': 1200, '12,5': 1250, '12.50': 1250, '1.234,56': 123456, '1,234.56': 123456,
    '1234,56': 123456, '€ 7.494,58': 749458, '0,99': 99, '-3,20': -320, '1.000': 100000,
  };
  for (const [input, cents] of Object.entries(cases)) assert.equal(parseAmount(input), cents, input);
});

test('parseAmount rejects non-numbers', () => {
  for (const bad of ['', 'abc', null, undefined, '€']) assert.equal(parseAmount(bad), null, String(bad));
});
