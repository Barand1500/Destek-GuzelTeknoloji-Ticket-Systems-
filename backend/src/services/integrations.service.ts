import bcrypt from "bcrypt";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import { notifyConversation, publishChange } from "./events.service.js";
import type { ConversationChannel } from "../generated/prisma/enums.js";

type InboundMessage = { provider: string; externalId: string; channel: "EMAIL" | "SMS" | "WHATSAPP"; sender: { email?: string; phone?: string; name?: string }; subject?: string; body: string; departmentId?: string | null };
const ticketNumber = (value: string) => /#(?:TK-)?0*(\d{1,10})\b|\[(?:TK-)?0*(\d{1,10})\]/i.exec(value)?.slice(1).find(Boolean);
const normalizedPhone = (value?: string) => value?.replace(/\D/g, "") ?? "";

async function defaultDepartment(id?: string | null) {
  const selected = id ? await db.department.findFirst({ where: { id, isActive: true, deletedAt: null } }) : null;
  return selected ?? db.department.findFirst({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" } });
}

export async function persistInboundMessage(input: InboundMessage) {
  const known = await db.externalMessage.findUnique({ where: { provider_externalId: { provider: input.provider, externalId: input.externalId } } });
  if (known) return known.conversationId;
  const email = input.sender.email?.trim().toLowerCase();
  const phone = normalizedPhone(input.sender.phone);
  let customer = await db.user.findFirst({ where: { role: "CUSTOMER", deletedAt: null, OR: [
    ...(email ? [{ email }, { extraEmails: { contains: email } }] : []),
    ...(phone ? [{ phone: { contains: phone } }, { extraPhones: { contains: phone } }] : []),
  ] }, orderBy: { createdAt: "asc" } });
  const number = ticketNumber(`${input.subject ?? ""}\n${input.body}`);
  let conversation = number ? await db.conversation.findFirst({ where: { number: Number(number), deletedAt: null, status: { not: "CLOSED" }, ...(email ? { customer: { email } } : phone ? { customer: { phone: { contains: phone } } } : {}) } }) : null;
  if (conversation) customer = await db.user.findUniqueOrThrow({ where: { id: conversation.customerId } });
  if (!customer) customer = await db.user.create({ data: { name: input.sender.name?.trim().slice(0, 100) || email || input.sender.phone || "Bilinmeyen müşteri", email: email ?? null, phone: input.sender.phone?.trim() || null, passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12), role: "CUSTOMER" } });
  const department = conversation ? null : await defaultDepartment(input.departmentId);
  if (!conversation && !department) throw new AppError(400, "NO_DEPARTMENT", "Gelen mesaj için aktif varsayılan departman bulunamadı.");
  const actor = { id: customer.id, name: customer.name, email: customer.email ?? "", role: "CUSTOMER" as const, departmentIds: [], sessionId: input.provider };
  const conversationId = await db.$transaction(async tx => {
    let target = conversation;
    if (!target) target = await tx.conversation.create({ data: { subject: (input.subject || `${input.channel} desteği`).slice(0, 200), searchSubject: (input.subject || `${input.channel} desteği`).normalize("NFKC").toLocaleLowerCase("tr-TR").slice(0, 200), channel: input.channel as ConversationChannel, customerId: customer!.id, departmentId: department!.id } });
    await tx.conversationMessage.create({ data: { conversationId: target.id, authorId: customer!.id, body: input.body.slice(0, 10_000), type: "CUSTOMER_MESSAGE" } });
    await tx.externalMessage.create({ data: { provider: input.provider, externalId: input.externalId, channel: input.channel as ConversationChannel, conversationId: target.id } });
    await tx.conversation.update({ where: { id: target.id }, data: { status: "OPEN" } });
    await tx.activityLog.create({ data: { userId: customer!.id, action: `conversation.${input.channel.toLowerCase()}_received`, entityId: target.id, metadata: { provider: input.provider, externalId: input.externalId } } });
    await notifyConversation(tx, actor, target, "MESSAGE_RECEIVED", `Yeni ${input.channel.toLocaleLowerCase("tr-TR")} mesajı`);
    return target.id;
  });
  publishChange(conversationId);
  return conversationId;
}

const equalsSecret = (provided: string | undefined, expected: string) => {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};
export async function receiveNetgsmMessage(body: Record<string, unknown>, secret?: string) {
  const settings = await db.integrationSettings.findUnique({ where: { id: "default" } });
  if (!settings?.smsEnabled || !equalsSecret(secret, settings.smsWebhookSecret)) throw new AppError(401, "INVALID_WEBHOOK", "Netgsm webhook doğrulaması başarısız.");
  const phone = String(body.msisdn ?? body.from ?? body.sender ?? "");
  const text = String(body.message ?? body.text ?? body.content ?? "").trim();
  const externalId = String(body.messageId ?? body.id ?? `${phone}:${body.timestamp ?? text}`);
  if (!phone || !text) throw new AppError(400, "INVALID_MESSAGE", "Netgsm mesajı eksik.");
  return persistInboundMessage({ provider: "netgsm", externalId, channel: "SMS", sender: { phone, name: String(body.name ?? "") || undefined }, body: text, subject: "SMS desteği", departmentId: settings.smsDepartmentId });
}
export async function verifyMetaWebhook(mode?: string, token?: string, challenge?: string) {
  const settings = await db.integrationSettings.findUnique({ where: { id: "default" } });
  return Boolean(settings?.whatsappEnabled && mode === "subscribe" && equalsSecret(token, settings.whatsappVerifyToken)) ? challenge : null;
}
export async function receiveMetaWebhook(payload: any, signature?: string, rawBody?: Buffer) {
  const settings = await db.integrationSettings.findUnique({ where: { id: "default" } });
  if (!settings?.whatsappEnabled || !settings.whatsappAppSecret || !rawBody) throw new AppError(401, "INVALID_WEBHOOK", "WhatsApp webhook doğrulaması başarısız.");
  const expected = `sha256=${(await import("node:crypto")).createHmac("sha256", settings.whatsappAppSecret).update(rawBody).digest("hex")}`;
  if (!equalsSecret(signature, expected)) throw new AppError(401, "INVALID_WEBHOOK", "WhatsApp webhook imzası geçersiz.");
  const ids: string[] = [];
  for (const entry of payload.entry ?? []) for (const change of entry.changes ?? []) {
    const value = change.value ?? {}; const contacts = new Map<string, string | undefined>((value.contacts ?? []).map((contact: any): [string, string | undefined] => [String(contact.wa_id), typeof contact.profile?.name === "string" ? contact.profile.name : undefined]));
    for (const message of value.messages ?? []) {
      const text = message.text?.body ?? message.button?.text ?? message.interactive?.button_reply?.title;
      if (!message.id || !message.from || !text) continue;
      ids.push(await persistInboundMessage({ provider: "meta-whatsapp", externalId: message.id, channel: "WHATSAPP", sender: { phone: message.from, name: contacts.get(message.from) }, body: text, subject: "WhatsApp desteği", departmentId: settings.whatsappDepartmentId }));
    }
  }
  return ids;
}
export async function sendChannelReply(channel: ConversationChannel, recipient: { email?: string | null; phone?: string | null }, text: string) {
  const settings = await db.integrationSettings.findUnique({ where: { id: "default" } });
  if (channel === "SMS") {
    if (!settings?.smsEnabled || !recipient.phone) throw new Error("SMS gönderim ayarı veya alıcı telefonu eksik.");
    const query = new URLSearchParams({ usercode: settings.smsApiUser, password: settings.smsApiPassword, gsmno: normalizedPhone(recipient.phone), message: text, msgheader: settings.smsSender, dil: "TR" });
    const response = await fetch(`https://api.netgsm.com.tr/sms/send/get/?${query}`); if (!response.ok) throw new Error("Netgsm SMS gönderimi başarısız.");
  }
  if (channel === "WHATSAPP") {
    if (!settings?.whatsappEnabled || !recipient.phone) throw new Error("WhatsApp gönderim ayarı veya alıcı telefonu eksik.");
    const response = await fetch(`https://graph.facebook.com/v20.0/${settings.whatsappPhoneNumberId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${settings.whatsappAccessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", to: normalizedPhone(recipient.phone), type: "text", text: { body: text } }) });
    if (!response.ok) throw new Error("WhatsApp mesajı gönderilemedi.");
  }
}
