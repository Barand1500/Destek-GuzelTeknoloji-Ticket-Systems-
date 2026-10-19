export type ContactChannel = 'TICKET' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'FORM';

export function contactChannels(customer: { phone?: string | null; email?: string | null }, enabled?: { EMAIL?: boolean; SMS?: boolean; WHATSAPP?: boolean; FORM?: boolean }): ContactChannel[] {
  const phone = Boolean(customer.phone?.trim());
  const email = Boolean(customer.email?.trim());
  return (['TICKET', 'EMAIL', 'SMS', 'WHATSAPP', 'FORM'] as const).filter(channel =>
    channel === 'TICKET' ? phone : Boolean(enabled?.[channel]) && ((channel === 'EMAIL' || channel === 'FORM') ? email : phone));
}
