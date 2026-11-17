import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleAlertChannels, smtpReady } from '../src/services/credit-alert-delivery.js';
import { retryableDeliveryError } from '../src/services/outbound-queue.service.js';
test('selection defaults only missing/null to IN_APP; empty and invalid selections send nothing', () => {
  assert.deepEqual(eligibleAlertChannels(null, null, {}), ['IN_APP']);
  assert.deepEqual(eligibleAlertChannels({ alertChannels: [] }, null, {}), []);
  assert.deepEqual(eligibleAlertChannels({ alertChannels: ['INVALID'] }, null, {}), []);
});
test('SMTP readiness follows stored disable and environment fallback, including optional auth', () => {
  const fallback: any = { SMTP_HOST: 'host', SMTP_FROM: 'from@example.com' };
  assert.equal(smtpReady(null, fallback), true);
  assert.equal(smtpReady({ smtpHost: 'stored', smtpEnabled: false }, fallback), false);
  assert.equal(smtpReady(null, { ...fallback, SMTP_USER: 'u' }), false);
  assert.equal(smtpReady(null, { ...fallback, SMTP_USER: 'u', SMTP_PASS: 'p' }), true);
});
test('WhatsApp requires separate utility template and valid contact; OTP config is insufficient', () => {
  const settings: any = { alertChannels: ['WHATSAPP'] };
  const integration: any = { whatsappEnabled: true, whatsappPhoneNumberId: 'id', whatsappAccessToken: 'token', whatsappAuthTemplateName: 'otp' };
  assert.deepEqual(eligibleAlertChannels(settings, integration, { phone: '05321234567' }), []);
  Object.assign(settings, { whatsappCreditTemplateName: 'credit_notice', whatsappCreditTemplateLanguage: 'tr' });
  assert.deepEqual(eligibleAlertChannels(settings, integration, { phone: '05321234567' }), ['WHATSAPP']);
  assert.deepEqual(eligibleAlertChannels(settings, integration, { phone: '123' }), []);
  assert.deepEqual(eligibleAlertChannels(settings, { ...integration, whatsappEnabled: false }, { phone: '05321234567' }), []);
});
test('transient external failures retain queue retry classification', () => {
  assert.equal(retryableDeliveryError({ statusCode: 429 }), true);
  assert.equal(retryableDeliveryError({ providerCode: 131000 }), true);
  assert.equal(retryableDeliveryError({ code: 'EAUTH' }), false);
});

test('utility template sends one body parameter to fixed Meta endpoint and preserves retry codes', async t => {
  const { db } = await import('../src/config/db.js');
  const { sendWhatsappTemplate } = await import('../src/services/integrations.service.js');
  t.mock.method(db.integrationSettings, 'findUnique', async () => ({ whatsappEnabled: true, whatsappPhoneNumberId: 'number', whatsappAccessToken: 'test' }));
  const requests: any[] = [];
  t.mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => {
    assert.equal(url, 'https://graph.facebook.com/v25.0/number/messages');
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({ messages: [{ id: 'wamid.test' }] });
  });
  assert.equal(await sendWhatsappTemplate('05321234567', { name: 'credit_alert', language: 'tr', parameters: ['Credit reminder'] }, 'job-id'), 'wamid.test');
  assert.equal(requests[0].type, 'template');
  assert.equal(requests[0].template.name, 'credit_alert');
  assert.deepEqual(requests[0].template.components, [{ type: 'body', parameters: [{ type: 'text', text: 'Credit reminder' }] }]);
  assert.equal(requests[0].biz_opaque_callback_data, 'job-id');
  await assert.rejects(sendWhatsappTemplate('05321234567', { name: '', language: 'tr', parameters: ['x'] }), { code: 'INVALID_WHATSAPP_TEMPLATE' });
  assert.equal(requests.length, 1);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 131000 } }, { status: 503 }));
  await assert.rejects(sendWhatsappTemplate('05321234567', { name: 'credit_alert', language: 'tr', parameters: ['x'] }), (error: any) => error.providerCode === 131000 && retryableDeliveryError(error));
});
