export type ContactChannel = 'TICKET' | 'EMAIL' | 'SMS' | 'WHATSAPP';

export function contactChannels(customer: { phone?: string | null; email?: string | null }, enabled?: { EMAIL?: boolean; SMS?: boolean; WHATSAPP?: boolean }): ContactChannel[] {
  const phone = Boolean(customer.phone?.trim());
  const email = Boolean(customer.email?.trim());
  return (['TICKET', 'EMAIL', 'SMS', 'WHATSAPP'] as const).filter(channel =>
    channel === 'TICKET' ? phone : Boolean(enabled?.[channel]) && (channel === 'EMAIL' ? email : phone));
}
