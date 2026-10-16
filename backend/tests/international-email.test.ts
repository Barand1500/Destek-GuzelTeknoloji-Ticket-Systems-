import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { canonicalEmail, emailSchema } from '../src/utils/email.js';
import { displayEmail } from '../../frontend/src/utils/email.ts';
import { matchesSender } from '../src/services/inbound-email-matching.js';
import { createCustomerSchema, updateCustomerSchema } from '../src/validators/management.js';

test('international email domains remain the same address through input, storage and display', () => {
  const human = 'baran@güzelteknoloji.com';
  const wire = 'baran@xn--gzelteknoloji-wob.com';
  assert.equal(emailSchema.parse(human), wire);
  assert.equal(emailSchema.parse(wire), wire);
  assert.equal(displayEmail(wire), human);
  assert.equal(canonicalEmail(displayEmail(wire)), wire);
  assert.equal(displayEmail('baran@guzelteknoloji.com'), 'baran@guzelteknoloji.com');
  assert.notEqual(canonicalEmail(human), canonicalEmail('baran@guzelteknoloji.com'));
  assert.equal(displayEmail(`${wire}, test@xn--gzelteknoloji-wob.com`), `${human}, test@güzelteknoloji.com`);
  assert.equal(createCustomerSchema.parse({ name: 'Baran', phone: '05304112150', email: human }).email, wire);
  assert.equal(updateCustomerSchema.parse({ email: human }).email, wire);
  assert.equal(updateCustomerSchema.parse({ extraEmails: human }).extraEmails, wire);
  assert.equal(matchesSender({ name: 'Baran', email: human, extraEmails: null }, wire), true);
  assert.equal(matchesSender({ name: 'Baran', email: wire, extraEmails: null }, human), true);
  for (const value of ['no-address', 'a@@example.com', 'a\n@example.com', 'a@bad domain.com']) {
    assert.equal(emailSchema.safeParse(value).success, false, value);
  }
});

test('mailer encodes IDN domains and retains Unicode mailbox names for SMTPUTF8', async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const result = await transport.sendMail({ from: 'support@example.com', to: 'baran@güzelteknoloji.com', subject: 'Test', text: 'Test' });
  assert.deepEqual(result.envelope.to, ['baran@xn--gzelteknoloji-wob.com']);
  const unicode = emailSchema.parse('ışık@güzelteknoloji.com');
  assert.equal(displayEmail(unicode), 'ışık@güzelteknoloji.com');
  const second = await transport.sendMail({ from: 'support@example.com', to: unicode, subject: 'Test', text: 'Test' });
  assert.deepEqual(second.envelope.to.map(canonicalEmail), [unicode]);
});
