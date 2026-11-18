import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { db } from '../config/db.js';
import { AppError } from '../utils/errors.js';
import { openPayment } from './payment-secrets.js';
import type { IyzicoConfig } from './iyzico-client.js';
import { reconcileIyzicoSession } from './iyzico-payments.service.js';

export async function handleIyzicoWebhook(raw: unknown, signature: string | undefined) {
  const data = z.object({ paymentConversationId: z.string().max(191), iyziEventType: z.string().max(80),
    status: z.string().max(40), token: z.string().max(255).optional(), paymentId: z.union([z.string(), z.number()]).optional(), iyziPaymentId: z.union([z.string(), z.number()]).optional() }).parse(raw);
  const session = await db.paymentCheckoutSession.findUnique({ where: { attemptId: data.paymentConversationId } });
  if (!session || !signature || !/^[a-f0-9]{64}$/i.test(signature)) throw new AppError(400, 'PAYMENT_SIGNATURE_INVALID', 'Ödeme bildirimi doğrulanamadı.');
  const { config } = openPayment<{ config: IyzicoConfig }>(session.contextCiphertext);
  if (session.token && session.token !== data.token) throw new AppError(400, 'PAYMENT_SIGNATURE_INVALID', 'Ödeme bildirimi doğrulanamadı.');
  const message = session.token
    ? config.secretKey + data.iyziEventType + String(data.iyziPaymentId ?? '') + data.token + data.paymentConversationId + data.status
    : config.secretKey + data.iyziEventType + String(data.paymentId ?? '') + data.paymentConversationId + data.status;
  const expected = createHmac('sha256', config.secretKey).update(message).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw new AppError(400, 'PAYMENT_SIGNATURE_INVALID', 'Ödeme bildirimi doğrulanamadı.');
  await reconcileIyzicoSession(session.id);
}
