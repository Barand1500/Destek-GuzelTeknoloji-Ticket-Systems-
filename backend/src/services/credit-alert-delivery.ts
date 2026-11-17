import { env } from '../config/env.js';
import type { CreditSalesSettings, IntegrationSettings } from '../generated/prisma/client.js';
import { netgsmRecipient, whatsappRecipient } from './integrations.service.js';
export type AlertChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP';

// Mirrors mailer's stored-settings/environment precedence, including unauthenticated SMTP.
export function smtpReady(settings: Partial<IntegrationSettings> | null, fallback = env): boolean {
  const stored = Boolean(settings && (settings.smtpHost || settings.smtpFromAddress || settings.smtpUser || settings.smtpPassword));
  if (stored && !settings!.smtpEnabled) return false;
  const user = settings?.smtpUser || fallback.SMTP_USER;
  return Boolean((settings?.smtpHost || fallback.SMTP_HOST) && (settings?.smtpFromAddress || fallback.SMTP_FROM) && (!user || settings?.smtpPassword || fallback.SMTP_PASSWORD || fallback.SMTP_PASS));
}
export function eligibleAlertChannels(settings: Partial<CreditSalesSettings> | null, integrations: Partial<IntegrationSettings> | null, owner: { email?: string | null; phone?: string | null }): AlertChannel[] {
  const selected = settings?.alertChannels == null ? ['IN_APP'] : Array.isArray(settings.alertChannels) ? settings.alertChannels : [];
  return (['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP'] as const).filter(channel => {
    if (!selected.includes(channel)) return false;
    if (channel === 'IN_APP') return true;
    if (channel === 'EMAIL') return Boolean(owner.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner.email) && smtpReady(integrations));
    if (channel === 'SMS') return Boolean(integrations?.smsEnabled && integrations.smsApiUser && integrations.smsApiPassword && integrations.smsSender && /^5\d{9}$/.test(netgsmRecipient(owner.phone ?? undefined)));
    return Boolean(integrations?.whatsappEnabled && integrations.whatsappPhoneNumberId && integrations.whatsappAccessToken && /^[1-9]\d{9,14}$/.test(whatsappRecipient(owner.phone ?? undefined)) && settings?.whatsappCreditTemplateName && /^[a-z0-9_]+$/.test(settings.whatsappCreditTemplateName) && /^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(settings.whatsappCreditTemplateLanguage ?? ''));
  });
}
