import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeXml,
  nestpayForm,
  nestpayHashVer3,
  nestpaySaleResult,
  parseNestpayXml,
  verifyNestpayCallback,
  type NestpayConfig,
} from '../src/services/nestpay-client.js';
import { getNestpayBank, isNestpayProvider, nestpayBanks } from '../src/services/payment-gateways.catalog.js';

const config: NestpayConfig = {
  bankId: 'isbank',
  clientId: '700655000200',
  storeKey: 'TEST1234|KEY',
  apiUser: 'ISBANKAPI',
  apiPassword: 'TEST<PASS>&1',
  mode: 'sandbox',
};

test('NestPay catalog covers major Turkish NestPay banks', () => {
  assert.ok(nestpayBanks.length >= 7);
  assert.equal(isNestpayProvider('isbank'), true);
  assert.equal(isNestpayProvider('ziraat'), true);
  assert.equal(isNestpayProvider('akbank'), false);
  assert.equal(getNestpayBank('ziraat')?.shortName, 'Ziraat Bankası');
});

test('nestpayForm builds signed ver3 3D form and verifyNestpayCallback checks signature and bindings', () => {
  const form = nestpayForm(config, {
    orderId: 'attempt-123',
    amount: '100.00',
    currency: 'TRY',
    callbackUrl: 'https://destek.example.com/api/v1/payments/nestpay/callback/sess-1',
    email: 'test@example.com',
    card: { holder: 'Test User', number: '4111111111111111', expiry: '1230', cvc: '123' },
  });
  assert.match(form.action, /^https:\/\//);
  assert.equal(form.fields.currency, '949');
  assert.equal(form.fields.hashAlgorithm, 'ver3');

  const callback: Record<string, string> = {
    clientid: config.clientId,
    oid: 'attempt-123',
    amount: '100.00',
    Response: 'Approved',
    ProcReturnCode: '00',
    mdStatus: '1',
  };
  callback.HASH = nestpayHashVer3(callback, config.storeKey);

  assert.equal(verifyNestpayCallback(config, callback, 'attempt-123', '100.00'), true);
  assert.equal(verifyNestpayCallback(config, { ...callback, amount: '99.00' }, 'attempt-123', '100.00'), false);
  assert.equal(verifyNestpayCallback(config, callback, 'other-attempt', '100.00'), false);
  assert.equal(verifyNestpayCallback(config, { ...callback, HASH: 'A'.repeat(86) + '==' }, 'attempt-123', '100.00'), false);
});

test('XML escaping and sale verification prevent injection and amount mismatch', () => {
  assert.equal(escapeXml('a<b>c&"d\''), 'a&lt;b&gt;c&amp;&quot;d&apos;');
  const reply = parseNestpayXml(`
    <CC5Response>
      <Response>Approved</Response>
      <ProcReturnCode>00</ProcReturnCode>
      <TransId>TX-999</TransId>
      <Extra>
        <CHARGE_TYPE_CD>S</CHARGE_TYPE_CD>
        <ORIG_TRANS_AMT>100.00</ORIG_TRANS_AMT>
        <AUTH_CODE>123456</AUTH_CODE>
      </Extra>
    </CC5Response>
  `);
  const verified = nestpaySaleResult(reply, { attemptId: 'att-1', provider: 'isbank', amount: '100.00', currency: 'TRY' });
  assert.equal(verified?.outcome, 'PAID');
  assert.throws(
    () => nestpaySaleResult(reply, { attemptId: 'att-1', provider: 'isbank', amount: '50.00', currency: 'TRY' }),
    { code: 'PAYMENT_MISMATCH' },
  );
});
