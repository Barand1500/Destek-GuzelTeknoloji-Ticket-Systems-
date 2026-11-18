import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { akbankHash, akbankForm, verifyAkbankCallback, akbankRequest, akbankSaleResult, akbankCardInput } from '../src/services/akbank-client.js';

const config = { merchantSafeId: 'merchant', terminalSafeId: 'terminal', secretKey: 'secret', mode: 'sandbox' as const };
test('Akbank signs form fields in official order and validates the complete callback binding', () => {
  const form = akbankForm(config, { orderId: 'attempt', amount: '12.50', currency: 'TRY', callbackUrl: 'https://portal.test/callback', email: 'test@example.test', phone: '05321234567', card: { holder: 'TEST USER', number: '4111111111111111', expiry: '1230', cvc: '123' } });
  assert.equal(form.action, 'https://virtualpospaymentgatewaypre.akbank.com/securepay');
  assert.equal(form.fields.paymentModel, '3D_PAY');
  assert.equal(form.fields.creditCard, '4111111111111111');
  assert.equal(form.fields.hash, akbankHash('3D_PAY3000merchantterminalattemptTR12.500.000.000.009491https://portal.test/callbackhttps://portal.test/callbacktest@example.test0532123456741111111111111111230123TEST USER' + form.fields.randomNumber + form.fields.requestDateTime, 'secret'));
  const callback: Record<string, string> = { txnCode: '1000', responseCode: 'VPS-0000', hostResponseCode: '00', merchantSafeId: 'merchant', terminalSafeId: 'terminal', orderId: 'attempt', amount: '12.50', installCount: '1' };
  callback.hashParams = Object.keys(callback).join('+');
  callback.hash = akbankHash(callback.hashParams.split('+').map(key => callback[key]).join(''), 'secret');
  assert.equal(verifyAkbankCallback(config, callback, 'attempt', '12.50'), true);
  assert.equal(verifyAkbankCallback(config, { ...callback, amount: '12.51' }, 'attempt', '12.50'), false);
  assert.equal(verifyAkbankCallback(config, callback, 'other', '12.50'), false);
  assert.equal(verifyAkbankCallback(config, { hashParams: 'responseCode', responseCode: 'VPS-0000', hash: akbankHash('VPS-0000', 'secret') }, 'attempt', '12.50'), false);
});
test('Akbank JSON transport signs the exact body and does not follow redirects', async () => {
  const result = await akbankRequest(config, '1010', { order: { orderId: 'attempt' } }, (async (url: any, init: any) => {
    assert.equal(url, 'https://apipre.akbank.com/api/v1/payment/virtualpos/transaction/process');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers['auth-hash'], createHmac('sha512', 'secret').update(init.body).digest('base64'));
    const body = JSON.stringify({ responseCode: 'VPS-0000', txnCode: '1010', terminal: { merchantSafeId: 'merchant', terminalSafeId: 'terminal' }, txnDetailList: [] });
    return new Response(body, { headers: { 'auth-hash': akbankHash(body, 'secret') } });
  }) as typeof fetch);
  assert.deepEqual(result.txnDetailList, []);
  await assert.rejects(akbankRequest(config, '1010', {}, (async () => Response.json({ responseCode: 'VPS-0000', txnCode: '1010', terminal: { merchantSafeId: 'merchant', terminalSafeId: 'terminal' }, txnDetailList: [] })) as typeof fetch), { code: 'PAYMENT_UNCERTAIN' });
  await assert.rejects(akbankRequest(config, '1010', {}, (async () => { throw Error('network'); }) as typeof fetch), { code: 'PAYMENT_UNCERTAIN' });
});
test('Only completed exact bank sales can settle; 3D authorization alone cannot grant credit', () => {
  const expected = { attemptId: 'attempt', amount: '12.50', currency: 'TRY' };
  const sale = { orderId: 'attempt', txnCode: '1000', responseCode: 'VPS-0000', hostResponseCode: '00', txnStatus: 'N', amount: '12.50', currencyCode: 949, installCount: 1 };
  assert.equal(akbankSaleResult([sale], expected)?.outcome, 'PAID');
  assert.equal(akbankSaleResult([{ ...sale, txnCode: '3000' }], expected), null);
  assert.equal(akbankSaleResult([{ ...sale, txnStatus: 'V' }], expected), null);
  assert.throws(() => akbankSaleResult([{ ...sale, amount: '12.51' }], expected), { code: 'PAYMENT_MISMATCH' });
  assert.throws(() => akbankSaleResult([{ ...sale, currencyCode: 840 }], expected), { code: 'PAYMENT_MISMATCH' });
  assert.throws(() => akbankCardInput.parse({ holder: 'TEST', number: '4111111111111112', expiry: '1230', cvc: '123' }));
});
