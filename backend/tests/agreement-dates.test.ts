import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agreementEndDate } from '../../frontend/src/utils/agreement-dates.js';
import { agreementInput } from '../src/services/agreements.service.js';
test('Calendar periods use inclusive ends and clamp short months and leap years', () => {
  assert.equal(agreementEndDate('2026-11-14', 'MONTHLY'), '2026-12-13');
  assert.equal(agreementEndDate('2026-11-14', 'YEARLY'), '2027-11-13');
  assert.equal(agreementEndDate('2026-01-31', 'MONTHLY'), '2026-02-28');
  assert.equal(agreementEndDate('2028-01-31', 'MONTHLY'), '2028-02-29');
  assert.equal(agreementEndDate('2028-02-29', 'YEARLY'), '2029-02-28');
  assert.equal(agreementEndDate('2026-12-01', 'MONTHLY'), '2026-12-31');
  assert.equal(agreementEndDate('', 'MONTHLY'), '');
  assert.equal(agreementEndDate('2026-02-30', 'MONTHLY'), '');
  assert.equal(agreementEndDate('2026-11-14', 'ONE_OFF'), '');
  assert.equal(agreementInput.parse({ name: 'Credit only', type: 'MONTHLY', startsOn: '2026-11-14', endsOn: '2026-12-13', credits: 5 }).fee, '0');
});
