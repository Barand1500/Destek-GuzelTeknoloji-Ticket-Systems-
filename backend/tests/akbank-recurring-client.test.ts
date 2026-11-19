import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { akbankRecurringTerms } from '../src/services/akbank-recurring-client.js';

test('Akbank instructions use bank-supported finite intervals without retaining cards', () => {
  assert.deepEqual(akbankRecurringTerms(1, null), { frequencyCycle: 'M', frequencyInterval: 1, numberOfPayments: 120 });
  assert.deepEqual(akbankRecurringTerms(3, null), { frequencyCycle: 'M', frequencyInterval: 3, numberOfPayments: 40 });
  assert.deepEqual(akbankRecurringTerms(null, 30), { frequencyCycle: 'D', frequencyInterval: 30, numberOfPayments: 120 });
  assert.throws(() => akbankRecurringTerms(null, 120), { code: 'AKBANK_RECURRING_PERIOD_UNSUPPORTED' });
});
