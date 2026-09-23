import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { db } from '../config/db.js';
import { publishChange } from './events.service.js';

async function transportForSettings() {
  const settings = await db.integrationSettings.findUnique({ where: { id: "default" } });
  const stored = Boolean(settings?.smtpEnabled && settings.smtpHost && settings.smtpFromAddress && (!settings.smtpUser || settings.smtpPassword));
  const host = stored ? settings!.smtpHost : env.SMTP_HOST;
  const from = stored ? settings!.smtpFromAddress : env.SMTP_FROM;
  const user = stored ? settings!.smtpUser : env.SMTP_USER;
  const password = stored ? settings!.smtpPassword : env.SMTP_PASSWORD ?? env.SMTP_PASS;
  const port = stored ? settings!.smtpPort : env.SMTP_PORT;
  const useTls = stored ? settings!.smtpSecure : env.SMTP_SECURE || env.SMTP_PORT === 465;
  if (!host || !from || (user && !password)) return null;
  // Gmail and most providers use STARTTLS on 587; implicit TLS is only used on 465.
  const secure = useTls && port === 465;
  return { from: stored && settings!.smtpFromName ? `${settings!.smtpFromName} <${from}>` : from, transport: nodemailer.createTransport({
  host, port,
  secure,
  requireTLS: useTls && port !== 465,
  dnsTimeout: 10_000,
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
  ...(user ? { auth: { user, pass: password } } : {}),
}) };
}

export async function sendSupportEmail(to: string, subject: string, text: string) {
  const mail = await transportForSettings();
  if (!mail) {
    console.warn('SMTP e-postası gönderilmedi: SMTP_HOST, SMTP_FROM veya SMTP kimlik bilgileri eksik.');
    throw Object.assign(new Error('SMTP ayarları eksik.'), { code: 'SMTP_NOT_CONFIGURED' });
  }
  const result = await mail.transport.sendMail({ from: mail.from, to, subject, text });
  if (!result.accepted.length || result.rejected.length) throw Object.assign(new Error('E-posta alıcısı sunucu tarafından reddedildi.'), { code: 'RECIPIENT_REJECTED' });
  return { sent: true, accepted: result.accepted.length, rejected: result.rejected.length, response: result.response, messageId: result.messageId };
}

export async function verifySupportEmail() {
  const mail = await transportForSettings();
  if (!mail) return { configured: false };
  await mail.transport.verify();
  return { configured: true };
}

type EmailAudit = { conversationId: string; userId: string };
type SmtpFailure = { code?: string; responseCode?: number; errno?: string | number; syscall?: string; command?: string; message?: string };
export function smtpFailureReason(error: SmtpFailure): string {
  if (error.code === 'EACCES' || error.code === 'EPERM' || (error.syscall === 'connect' && (error.errno === -4092 || /\b(EACCES|EPERM)\b/.test(error.message ?? '')))) {
    return 'SMTP bağlantısına işletim sistemi veya çalıştırma ortamı izin vermedi (EACCES). Backend sürecinin dış ağ erişimini kontrol edin.';
  }
  return `${error.code ?? 'SMTP_ERROR'}${error.errno !== undefined ? ` (${error.errno})` : ''}${error.command ? ` · ${error.command}` : ''}${error.responseCode ? ` · SMTP ${error.responseCode}` : ''}`;
}
export async function deliverSupportEmail(to: string, subject: string, text: string, context: string, audit?: EmailAudit,
  send = sendSupportEmail,
  wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
) {
  let failure: SmtpFailure | undefined;
  let receipt: Awaited<ReturnType<typeof sendSupportEmail>> | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      receipt = await send(to, subject, text);
      failure = undefined;
      break;
    } catch (error) {
      failure = error as typeof failure;
      const permanent = ['EAUTH', 'SMTP_NOT_CONFIGURED', 'RECIPIENT_REJECTED', 'EENVELOPE'].includes(failure?.code ?? '') || (failure?.responseCode ?? 0) >= 500;
      if (permanent || attempt === 3) break;
      await wait(attempt * 5_000);
    }
  }
  if (failure) console.error(`${context} e-postası gönderilemedi:`, { reason: smtpFailureReason(failure), code: failure.code, responseCode: failure.responseCode, errno: failure.errno, syscall: failure.syscall, command: failure.command });
  if (audit) {
    await db.activityLog.create({ data: { userId: audit.userId, entityId: audit.conversationId,
      action: failure ? 'conversation.email_failed' : 'conversation.email_sent',
      metadata: { reason: failure ? `${context}: ${smtpFailureReason(failure)}` : context, recipient: to, ...(failure ? { code: failure.code ?? 'SMTP_ERROR', command: failure.command ?? '', syscall: failure.syscall ?? '' } : {}), ...(failure?.responseCode ? { responseCode: failure.responseCode } : {}), ...(receipt ? { messageId: receipt.messageId ?? '', smtpResponse: receipt.response, accepted: receipt.accepted } : {}) },
    } });
    publishChange(audit.conversationId, true);
  }
  return { sent: !failure };
}
export function queueSupportEmail(to: string, subject: string, text: string, context: string, audit?: EmailAudit) {
  if (env.NODE_ENV === "test") return;
  setImmediate(() => {
    void deliverSupportEmail(to, subject, text, context, audit).catch((error) => {
      console.error(`${context} e-postası gönderilemedi:`, error);
    });
  });
}
