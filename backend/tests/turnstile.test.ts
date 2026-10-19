import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { env } from '../src/config/env.js';
import { verifyTurnstile, publicAuthSecurity } from '../src/services/turnstile.service.js';
import { app } from '../src/app.js';
import { db } from '../src/config/db.js';

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
  assert.deepEqual(publicAuthSecurity(), { enabled: true, siteKey: 'public-site-key' });
  assert(!JSON.stringify(publicAuthSecurity()).includes('server-only-secret'));
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
