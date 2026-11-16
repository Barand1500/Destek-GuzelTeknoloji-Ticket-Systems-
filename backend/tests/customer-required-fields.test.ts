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

test('customer edits reject clearing required fields while preserving partial account updates',()=>{
 const input={company:'Example Company',name:'Example Customer',phone:'0532 123 45 67',email:'customer@example.com'};
 assert.equal(updateCustomerSchema.safeParse(input).success,true);
 for(const field of ['company','name','phone','email']) for(const value of ['', ' ', null]) assert.equal(updateCustomerSchema.safeParse({[field]:value}).success,false,field+' cannot be cleared');
 assert.equal(updateCustomerSchema.safeParse({phone:'abcdefghi'}).success,false);
 assert.equal(updateCustomerSchema.safeParse({isActive:false}).success,true);
});
