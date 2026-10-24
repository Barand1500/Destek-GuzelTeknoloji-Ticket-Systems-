import { useEffect, useState } from 'react';
import type { Conversation } from '../../types';
import { elapsedDuration } from '../../utils/elapsed-duration';

export function WhatsappWindowWarning({ conversation }: { conversation: Conversation }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 15_000); return () => window.clearInterval(timer); }, []);
  const serviceWindow = conversation.whatsappServiceWindow;
  const selected = conversation.replyChannels?.length ? conversation.replyChannels : [conversation.channel];
  if (!selected.includes('WHATSAPP') || !serviceWindow || (!serviceWindow.expired && serviceWindow.expiresAt && now < Date.parse(serviceWindow.expiresAt))) return null;
  const elapsed = serviceWindow.lastInboundAt ? elapsedDuration(serviceWindow.lastInboundAt, now) : null;
  return <div className="whatsapp-window-warning" role="status">
    <strong>WhatsApp: 24 saatlik yanıt süresi kapalı.</strong>
    <span>{elapsed === null ? 'Müşterinin WhatsApp üzerinden gönderdiği bir mesaj kaydı bulunamadı.' : `Müşterinin son WhatsApp mesajının üzerinden ${elapsed}.`} Bu alandan yazılan normal yanıt WhatsApp’a iletilemez. Müşterinin WhatsApp numaranıza yeniden mesaj yazması gerekir; ardından 24 saatlik süre yeniden başlar. Form veya e-posta mesajları bu süreyi yenilemez.</span>
  </div>;
}
