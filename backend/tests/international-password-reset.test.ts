import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';
import { canonicalEmail } from '../src/utils/email.js';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/app.js');
const { db } = await import('../src/config/db.js');

test('Unicode email login and password recovery share one identity through the HTTP API', async t => {
  const people: string[] = [];
  const sent: Array<{ to: string; text: string }> = [];
  const originalSettings = db.integrationSettings.findUnique;
  db.integrationSettings.findUnique = (async () => ({ smtpEnabled: true, smtpHost: 'smtp.example.test', smtpFromAddress: 'support@example.test', smtpPort: 587, smtpSecure: true })) as typeof originalSettings;
  t.after(() => { db.integrationSettings.findUnique = originalSettings; });
  t.mock.method(nodemailer, 'createTransport', () => ({ sendMail: async (mail: { to: string; text: string }) => {
    sent.push(mail);
    return { accepted: [mail.to], rejected: [], response: '250 accepted', messageId: `<${randomUUID()}@example.test>` };
  } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/auth`;
  const request = async (path: string, body: object) => {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
  };
  try {
    for (const local of ['baran', 'ışık']) {
      const human = `${local}-${randomUUID()}@güzelteknoloji.com`;
      const wire = canonicalEmail(human);
      const user = await db.user.create({ data: { name: 'International reset test', email: wire, loginEmail: wire, passwordHash: await bcrypt.hash('old-password', 4) } }); people.push(user.id);
      assert.equal((await request('/login', { email: human, password: 'old-password' })).status, 200);
      const previousCount = sent.length;
      assert.equal((await request('/forgot-password', { email: local === 'baran' ? human : wire })).status, 200);
      assert.equal(sent.length, previousCount + 1);
      assert.equal(sent.at(-1)!.to, wire);
      const code = sent.at(-1)!.text.match(/\b\d{6}\b/)![0];
      const verified = await request('/verify-reset-code', { email: local === 'baran' ? wire : human, code });
      assert.equal(verified.status, 200);
      assert.equal((await request('/reset-password', { resetToken: verified.body.data.resetToken, password: 'new-password' })).status, 200);
      assert.equal((await request('/login', { email: human, password: 'old-password' })).status, 401);
      assert.equal((await request('/login', { email: wire, password: 'new-password' })).status, 200);
    }
    const count = sent.length;
    assert.equal((await request('/forgot-password', { email: 'not-an-email' })).status, 400);
    assert.equal((await request('/forgot-password', { email: `unknown-${randomUUID()}@güzelteknoloji.com` })).status, 200);
    assert.equal(sent.length, count);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    t.mock.restoreAll();
    await db.passwordReset.deleteMany({ where: { userId: { in: people } } });
    await db.session.deleteMany({ where: { userId: { in: people } } });
    await db.user.deleteMany({ where: { id: { in: people } } });
    await db.$disconnect();
  }
});
