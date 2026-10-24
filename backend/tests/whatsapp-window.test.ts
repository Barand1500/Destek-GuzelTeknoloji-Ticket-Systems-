import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whatsappWindow, whatsappWindowMs } from '../src/services/whatsapp-window.js';

test('WhatsApp warning expires at 24 hours and only a new inbound timestamp reopens it', () => {
  const inbound = new Date('2026-10-23T07:00:00Z');
  assert.equal(whatsappWindow(inbound, inbound.getTime() + whatsappWindowMs - 1).expired, false);
  assert.equal(whatsappWindow(inbound, inbound.getTime() + whatsappWindowMs).expired, true);
  assert.equal(whatsappWindow(inbound, inbound.getTime() + 2 * whatsappWindowMs).expired, true);
  assert.equal(whatsappWindow(null).expired, true);
  const fresh = new Date(inbound.getTime() + 2 * whatsappWindowMs);
  assert.equal(whatsappWindow(fresh, fresh.getTime()).expired, false);
  assert.equal(whatsappWindow(inbound).expiresAt, '2026-10-24T07:00:00.000Z');
});
