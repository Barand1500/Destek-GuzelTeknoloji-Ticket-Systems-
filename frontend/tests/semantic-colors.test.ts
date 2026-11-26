import assert from 'node:assert/strict';
import test from 'node:test';
import { optionColor, responseColor, semanticColors } from '../src/utils/semantic-colors';

test('built-in response and option colors share one palette', () => {
  assert.equal(responseColor('fast', '#16715d'), semanticColors.success);
  assert.equal(optionColor('status', 'OPEN', '#2f8f73'), semanticColors.success);
  assert.equal(optionColor('status', 'RESOLVED', '#398571'), semanticColors.success);
  assert.equal(responseColor('normal', '#a86606'), semanticColors.warning);
  assert.equal(optionColor('status', 'PENDING', '#d49a2a'), semanticColors.warning);
  assert.equal(optionColor('priority', 'HIGH', '#dd7a2d'), semanticColors.warning);
  assert.equal(responseColor('late', '#c2413c'), semanticColors.danger);
  assert.equal(optionColor('priority', 'URGENT', '#c94b4b'), semanticColors.danger);
});

test('custom colors are preserved exactly, including custom option codes', () => {
  for (const kind of ['fast', 'normal', 'late'] as const) assert.equal(responseColor(kind, '#12AB34'), '#12AB34');
  assert.equal(optionColor('status', 'PENDING', '#112233'), '#112233');
  assert.equal(optionColor('priority', 'URGENT', '#123456'), '#123456');
  assert.equal(optionColor('status', 'CUSTOM', '#aabbcc'), '#aabbcc');
});
