import { allowedOrigins } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { effectiveTurnstileSettings } from './turnstile-settings.service.js';

export type TurnstileAction = 'login' | 'register' | 'forgot_password' | 'form_submit' | 'form_access';
export async function publicAuthSecurity() {
  const settings = await effectiveTurnstileSettings();
  return { enabled: settings.enabled, siteKey: settings.enabled ? settings.siteKey : null };
}

export async function verifyTurnstile(token: string | undefined, action: TurnstileAction, ip?: string) {
  const settings = await effectiveTurnstileSettings();
  if (!settings.enabled) return;
  if (!settings.secretKey || !settings.siteKey) throw new AppError(503, 'CAPTCHA_UNAVAILABLE', 'Güvenlik doğrulaması şu anda kullanılamıyor.');
  if (!token?.trim() || token.length > 2048) throw new AppError(400, 'CAPTCHA_REQUIRED', 'Lütfen güvenlik doğrulamasını tamamlayın.');
  let result: { success?: boolean; hostname?: string; action?: string };
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: settings.secretKey, response: token, ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('Provider unavailable');
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid provider response');
    result = data;
  } catch {
    // Never log tokens, secrets, or the provider request/response.
    throw new AppError(503, 'CAPTCHA_UNAVAILABLE', 'Güvenlik doğrulaması yapılamadı. Lütfen yeniden deneyin.');
  }
  const hostnames = new Set([...allowedOrigins].map(origin => new URL(origin).hostname.toLowerCase()));
  if (result.success !== true || result.action !== action || typeof result.hostname !== 'string' || !hostnames.has(result.hostname.toLowerCase())) {
    throw new AppError(403, 'CAPTCHA_INVALID', 'Güvenlik doğrulaması geçersiz veya süresi dolmuş. Lütfen yeniden doğrulayın.');
  }
}
