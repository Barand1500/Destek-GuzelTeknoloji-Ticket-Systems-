import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerSchema, updateCustomerSchema } from '../src/validators/management.js';

test('manual customer creation requires company, name, phone and email but permits optional details', () => {
  const input = { company: 'Example Company', name: 'Example Customer', phone: '0532 123 45 67', email: 'customer@example.com' };
  assert.equal(createCustomerSchema.safeParse(input).success, true);
  for (const field of ['company', 'name', 'phone', 'email'] as const) {
    const missing: Record<string, unknown> = { ...input }; delete missing[field];
    assert.equal(createCustomerSchema.safeParse(missing).success, false, `${field} is required`);
    assert.equal(createCustomerSchema.safeParse({ ...input, [field]: ' ' }).success, false);
  }
  assert.equal(createCustomerSchema.safeParse({ ...input, phone: 'abcdefghi' }).success, false);
  assert.equal(createCustomerSchema.safeParse({ ...input, email: 'invalid' }).success, false);
  assert.equal(createCustomerSchema.safeParse({ ...input, extraPhones: '0533 123 45 67', extraEmails: 'extra@example.com', staffNote: 'Customer note' }).success, true);
  // Editing existing records still supports partial updates.
  assert.equal(updateCustomerSchema.safeParse({ staffNote: 'Updated note' }).success, true);
});
