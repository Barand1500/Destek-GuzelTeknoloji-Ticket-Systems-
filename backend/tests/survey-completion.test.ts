import { test } from 'node:test';
import assert from 'node:assert/strict';
import { surveyCompletionRate } from '../src/services/survey-completion.ts';

test('completion excludes administrators outside the recipient list', () => {
  const recipients = [{ userId: 'agent' }];
  assert.equal(surveyCompletionRate(recipients, [{ userId: 'admin' }]), 0);
  assert.equal(surveyCompletionRate(recipients, [{ userId: 'admin' }, { userId: 'agent' }]), 100);
});

test('completion handles partial, empty and repeated participation', () => {
  assert.equal(surveyCompletionRate([{ userId: 'a' }, { userId: 'b' }], [{ userId: 'a' }]), 50);
  assert.equal(surveyCompletionRate([], [{ userId: 'admin' }]), 0);
  assert.equal(surveyCompletionRate([{ userId: 'a' }], [{ userId: 'a' }, { userId: 'a' }]), 100);
});
