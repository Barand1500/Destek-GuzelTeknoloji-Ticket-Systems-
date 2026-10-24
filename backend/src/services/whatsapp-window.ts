export const whatsappWindowMs = 24 * 60 * 60 * 1000;
export function whatsappWindow(lastInboundAt: Date | null, now = Date.now()) {
  return { lastInboundAt: lastInboundAt?.toISOString() ?? null, expiresAt: lastInboundAt ? new Date(lastInboundAt.getTime() + whatsappWindowMs).toISOString() : null,
    expired: !lastInboundAt || now >= lastInboundAt.getTime() + whatsappWindowMs };
}
