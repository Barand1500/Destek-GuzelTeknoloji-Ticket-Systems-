import 'dotenv/config';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { env } from '../src/config/env.js';
import { verifyTurnstile, publicAuthSecurity } from '../src/services/turnstile.service.js';
import { app } from '../src/app.js';
import { db } from '../src/config/db.js';
const originalSecurityFind = db.turnstileSettings.findUnique.bind(db.turnstileSettings);
db.turnstileSettings.findUnique = (async () => null) as typeof db.turnstileSettings.findUnique;
after(() => { db.turnstileSettings.findUnique = originalSecurityFind; });

test('Turnstile validates provider success, action and hostname and never bypasses provider errors', async t => {
  const original = { enabled: env.TURNSTILE_ENABLED, site: env.TURNSTILE_SITE_KEY, secret: env.TURNSTILE_SECRET_KEY };
  const hostname = new URL(env.FRONTEND_URL).hostname;
  let calls = 0;
  let reply: unknown = { success: true, hostname, action: 'login' };
  let unavailable = false;
  t.after(() => { env.TURNSTILE_ENABLED = original.enabled; env.TURNSTILE_SITE_KEY = original.site; env.TURNSTILE_SECRET_KEY = original.secret; });
  t.mock.method(globalThis, 'fetch', async (url: unknown, options?: RequestInit) => {
    calls++;
    assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const body = JSON.parse(String(options?.body));
    assert.equal(body.secret, 'server-only-secret');
    assert.equal(body.remoteip, '127.0.0.1');
    assert(options?.signal);
    if (unavailable) throw new Error('Provider timeout');
    return Response.json(reply);
  });
  env.TURNSTILE_ENABLED = false;
  await verifyTurnstile(undefined, 'login');
  assert.equal(calls, 0);
  env.TURNSTILE_ENABLED = true; env.TURNSTILE_SITE_KEY = 'public-site-key'; env.TURNSTILE_SECRET_KEY = 'server-only-secret';
  assert.deepEqual(await publicAuthSecurity(), { enabled: true, siteKey: 'public-site-key' });
  assert(!JSON.stringify(await publicAuthSecurity()).includes('server-only-secret'));
  for (const token of [undefined, '', ' ', 'a'.repeat(2049)]) {
    await assert.rejects(verifyTurnstile(token, 'login'), error => (error as { code: string }).code === 'CAPTCHA_REQUIRED');
  }
  assert.equal(calls, 0);
  await verifyTurnstile('valid-one-time-token', 'login', '127.0.0.1');
  for (const invalid of [
    { success: false, 'error-codes': ['timeout-or-duplicate'] },
    { success: true, hostname: 'attacker.example', action: 'login' },
    { success: true, hostname, action: 'register' },
    { success: 'true', hostname, action: 'login' },
    {},
  ]) {
    reply = invalid;
    await assert.rejects(verifyTurnstile('expired-or-wrong-token', 'login', '127.0.0.1'), error => (error as { code: string }).code === 'CAPTCHA_INVALID');
  }
  unavailable = true;
  await assert.rejects(verifyTurnstile('valid', 'login', '127.0.0.1'), error => (error as { code: string }).code === 'CAPTCHA_UNAVAILABLE');
});

test('HTTP auth endpoints require CAPTCHA when enabled, including direct API requests', async () => {
  const original = { enabled: env.TURNSTILE_ENABLED, site: env.TURNSTILE_SITE_KEY, secret: env.TURNSTILE_SECRET_KEY };
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  try {
    env.TURNSTILE_ENABLED = true; env.TURNSTILE_SITE_KEY = 'public-site-key'; env.TURNSTILE_SECRET_KEY = 'private-key';
    const config = await (await fetch(`${url}/auth/security`)).json();
    assert.deepEqual(config.data, { enabled: true, siteKey: 'public-site-key' });
    for (const [path, body] of [
      ['/auth/login', { email: 'test@example.test', password: 'test-password' }],
      ['/auth/register', { email: 'test@example.test', password: 'test-password', name: 'Test person' }],
      ['/auth/forgot-password', { email: 'test@example.test' }],
    ] as const) {
      const response = await fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'CAPTCHA_REQUIRED');
    }
    env.TURNSTILE_ENABLED = false;
    assert.deepEqual((await (await fetch(`${url}/auth/security`)).json()).data, { enabled: false, siteKey: null });
  } finally {
    env.TURNSTILE_ENABLED = original.enabled; env.TURNSTILE_SITE_KEY = original.site; env.TURNSTILE_SECRET_KEY = original.secret;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.$disconnect();
  }
});

test('panel settings persist, override environment, preserve secrets and enforce permissions without exposing credentials', async t => {
  const { getTurnstileSettings, revealTurnstileSecret, saveTurnstileSettings } = await import('../src/services/turnstile-settings.service.js');
  db.turnstileSettings.findUnique = originalSecurityFind;
  const previous = await originalSecurityFind({ where: { id: 'default' } });
  const originalEnv = { enabled: env.TURNSTILE_ENABLED, site: env.TURNSTILE_SITE_KEY, secret: env.TURNSTILE_SECRET_KEY, node: env.NODE_ENV };
  const user = await db.user.create({ data: { name: 'Turnstile settings fixture', role: 'ADMIN', passwordHash: 'test' } });
  const actor = { id: user.id, name: user.name, email: '', role: 'ADMIN' as const, departmentIds: [], sessionId: '' };
  const reader = { ...actor, role: 'AGENT' as const, rolePermissions: ['integrations.view'] };
  let calls = 0;
  const secret = 'panel-server-only-secret';
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options?: RequestInit) => {
    calls++;
    const body = JSON.parse(String(options?.body));
    assert.equal(body.secret, secret);
    return Response.json({ success: true, hostname: new URL(env.FRONTEND_URL).hostname, action: 'form_submit' });
  });
  try {
    env.TURNSTILE_ENABLED = false; env.TURNSTILE_SECRET_KEY = ''; env.TURNSTILE_SITE_KEY = '';
    await db.turnstileSettings.deleteMany({ where: { id: 'default' } });
    await assert.rejects(saveTurnstileSettings(reader, { enabled: false, siteKey: '' }), error => (error as { status: number }).status === 403);
    await assert.rejects(getTurnstileSettings({ ...reader, rolePermissions: [] }), error => (error as { status: number }).status === 403);
    await assert.rejects(saveTurnstileSettings(actor, { enabled: true, siteKey: 'site' }), error => (error as { code: string }).code === 'CAPTCHA_KEYS_REQUIRED');
    const saved = await saveTurnstileSettings(actor, { enabled: true, siteKey: 'panel-site-key', secretKey: secret });
    assert.deepEqual(saved, { enabled: true, siteKey: 'panel-site-key', secretConfigured: true, secretLength: secret.length });
    const persisted = await originalSecurityFind({ where: { id: 'default' } });
    assert(persisted?.secretCiphertext && !persisted.secretCiphertext.includes(secret));
    assert.deepEqual(await publicAuthSecurity(), { enabled: true, siteKey: 'panel-site-key' });
    assert(!JSON.stringify(await getTurnstileSettings(reader)).includes(secret));
    await assert.rejects(revealTurnstileSecret(reader), error => (error as { status: number }).status === 403);
    assert.deepEqual(await revealTurnstileSecret(actor), { secretKey: secret });
    await assert.rejects(verifyTurnstile(undefined, 'form_submit'), error => (error as { code: string }).code === 'CAPTCHA_REQUIRED');
    await verifyTurnstile('token', 'form_submit');
    assert.equal(calls, 1);
    await saveTurnstileSettings(actor, { enabled: true, siteKey: 'panel-site-key', secretKey: '' });
    assert.equal((await originalSecurityFind({ where: { id: 'default' } }))?.secretCiphertext, persisted.secretCiphertext);
    await verifyTurnstile('token', 'form_submit');
    env.NODE_ENV = 'production';
    await assert.rejects(saveTurnstileSettings(actor, { enabled: true, siteKey: '1x00000000000000000000AA' }), error => (error as { code: string }).code === 'CAPTCHA_TEST_KEY');
    env.NODE_ENV = originalEnv.node;
    env.TURNSTILE_ENABLED = true; env.TURNSTILE_SITE_KEY = 'legacy-site'; env.TURNSTILE_SECRET_KEY = 'legacy-secret';
    await saveTurnstileSettings(actor, { enabled: false, siteKey: 'panel-site-key' });
    assert.deepEqual(await publicAuthSecurity(), { enabled: false, siteKey: null });
    await verifyTurnstile(undefined, 'login'); assert.equal(calls, 2);
    const audit = await db.activityLog.findMany({ where: { userId: user.id } });
    assert(!JSON.stringify(audit).includes(secret));
    assert(!JSON.stringify(audit).includes(persisted.secretCiphertext));
    await saveTurnstileSettings(actor, { enabled: true, siteKey: 'panel-site-key' });
    await db.turnstileSettings.update({ where: { id: 'default' }, data: { secretCiphertext: 'corrupt' } });
    await assert.rejects(verifyTurnstile('token', 'login'), error => (error as { code: string }).code === 'CAPTCHA_UNAVAILABLE');
  } finally {
    env.TURNSTILE_ENABLED = originalEnv.enabled; env.TURNSTILE_SITE_KEY = originalEnv.site; env.TURNSTILE_SECRET_KEY = originalEnv.secret; env.NODE_ENV = originalEnv.node;
    if (previous) await db.turnstileSettings.upsert({ where: { id: 'default' }, create: previous, update: previous });
    else await db.turnstileSettings.deleteMany({ where: { id: 'default' } });
    await db.activityLog.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
    db.turnstileSettings.findUnique = (async () => null) as typeof db.turnstileSettings.findUnique;
    await db.$disconnect();
  }
});
