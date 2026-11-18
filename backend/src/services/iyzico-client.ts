import { createHmac, randomBytes } from 'node:crypto';
import { AppError } from '../utils/errors.js';
export type IyzicoConfig = { apiKey: string; secretKey: string; mode: 'sandbox' | 'production' };
export function iyzicoAuthorization(config: IyzicoConfig, path: string, body: string, random = randomBytes(16).toString('hex')) {
  const signature = createHmac('sha256', config.secretKey).update(random + path + body).digest('hex');
  return { Authorization: 'IYZWSv2 ' + Buffer.from(`apiKey:${config.apiKey}&randomKey:${random}&signature:${signature}`).toString('base64'), 'x-iyzi-rnd': random };
}
export async function iyzicoRequest(config: IyzicoConfig, path: string, input: Record<string, unknown>, fetcher: typeof fetch = fetch, method: 'POST' | 'GET' = 'POST'): Promise<Record<string, any>> {
  const body = method === 'GET' ? '' : JSON.stringify(input);
  try {
    const response = await fetcher((config.mode === 'production' ? 'https://api.iyzipay.com' : 'https://sandbox-api.iyzipay.com') + path, {
      method, redirect: 'error', headers: { 'Content-Type': 'application/json', ...iyzicoAuthorization(config, method === 'GET' ? path.split('?')[0] : path, body) },
      ...(method === 'POST' ? { body } : {}), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('HTTP');
    const text = await response.text();
    if (text.length > 512_000) throw new Error('SIZE');
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || !['success', 'failure'].includes(value.status)) throw new Error('RESPONSE');
    return value;
  } catch { throw new AppError(503, 'PAYMENT_UNCERTAIN', 'Ödeme sağlayıcısından sonuç alınamadı. İşlem yeniden çekilmeden sorgulanacak.'); }
}
export function hostedPaymentUrl(value: unknown, mode: IyzicoConfig['mode']) {
  if (typeof value !== 'string') throw new AppError(502, 'PAYMENT_RESPONSE_INVALID', 'Ödeme sayfası oluşturulamadı.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== (mode === 'production' ? 'cpp.iyzipay.com' : 'sandbox-cpp.iyzipay.com') || url.username || url.password || url.port)
    throw new AppError(502, 'PAYMENT_RESPONSE_INVALID', 'Ödeme sayfası adresi doğrulanamadı.');
  return url.toString();
}
