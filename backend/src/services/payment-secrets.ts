import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const key = () => createHash('sha256').update('payments-v1:' + (env.PAYMENT_ENCRYPTION_KEY || env.JWT_ACCESS_SECRET)).digest();
export function sealPayment(value: unknown): string {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(part => part.toString('base64')).join('.');
}
export function openPayment<T>(value: string): T {
  try {
    const parts = value.split('.');
    if (parts.length !== 3 || parts.some(part => Buffer.from(part, 'base64').toString('base64') !== part)) throw new Error('Invalid ciphertext');
    const [iv, tag, data] = parts.map(part => Buffer.from(part, 'base64'));
    if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid ciphertext');
    const cipher = createDecipheriv('aes-256-gcm', key(), iv); cipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8'));
  } catch { throw new AppError(503, 'PAYMENT_KEY_UNAVAILABLE', 'Ödeme bilgileri okunamadı. Şifreleme anahtarını kontrol edin.'); }
}
