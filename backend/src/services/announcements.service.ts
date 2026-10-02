import { unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "../config/db.js";
import type { Actor } from "../types/express.js";
import { AppError } from "../utils/errors.js";
import { uploadRoot, type StoredUpload } from "./uploads.service.js";
import { sendAnnouncementEmail } from "./mailer.service.js";
import { sendAnnouncementSms } from "./integrations.service.js";
import { publishChange } from "./events.service.js";

type Input = { title: string; body: string; audience: "CUSTOMERS" | "STAFF" | "ALL" | "PERSON"; recipientId?: string; priority: "LOW" | "NORMAL" | "HIGH" | "URGENT"; channels: Array<"APP" | "EMAIL" | "SMS">; saveTemplate?: boolean; eventAt?: string | null };
const channelNames: Record<string, string> = { APP: "uygulama", EMAIL: "e-posta", SMS: "SMS" };
const requireAdmin = (actor: Actor) => { if (actor.role !== "ADMIN") throw new AppError(403, "FORBIDDEN", "Duyuruları yalnızca yönetici yönetebilir."); };

export async function recipients(actor: Actor) {
  requireAdmin(actor);
  return db.user.findMany({ where: { deletedAt: null, isActive: true, role: { in: ["CUSTOMER", "SUPERVISOR", "AGENT"] } }, select: { id: true, name: true, email: true, phone: true, company: true, role: true }, orderBy: [{ role: "asc" }, { name: "asc" }] });
}

export async function list(actor: Actor) {
  if (actor.role !== "ADMIN") {
    const deliveries = await db.announcementDelivery.findMany({ where: { userId: actor.id, channels: { contains: "APP" } }, orderBy: { deliveredAt: "desc" }, take: 100, include: { announcement: { include: { author: { select: { name: true } }, attachments: { select: { id: true, originalName: true, mimeType: true, size: true } } } } } });
    return { announcements: deliveries.map(item => ({ ...item.announcement, deliveries: [{ status: item.status, channels: item.channels, error: item.error }] })), templates: [] };
  }
  const announcements = await db.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { author: { select: { name: true } }, attachments: { select: { id: true, originalName: true, mimeType: true, size: true } }, deliveries: { select: { status: true, channels: true, error: true } } } });
  const templates = await db.announcementTemplate.findMany({ orderBy: { updatedAt: "desc" } });
  return { announcements, templates };
}

export async function create(actor: Actor, input: Input, files: StoredUpload[]) {
  requireAdmin(actor);
  if (!input.channels.length) throw new AppError(400, "CHANNEL_REQUIRED", "En az bir gönderim kanalı seçin.");
  if (input.audience === "PERSON" && !input.recipientId) throw new AppError(400, "RECIPIENT_REQUIRED", "Tek kişi gönderimi için bir alıcı seçin.");
  if (input.audience === "PERSON" && !["ADMIN", "SUPERVISOR", "AGENT", "CUSTOMER"].includes(actor.role)) throw new AppError(403, "FORBIDDEN", "Bu alıcıya duyuru gönderme yetkiniz yok.");
  if (files.length > 10) throw new AppError(400, "TOO_MANY_FILES", "Bir duyuruya en fazla 10 dosya ekleyebilirsiniz.");
  const where = input.audience === "PERSON" ? { id: input.recipientId, deletedAt: null, isActive: true, role: { in: ["CUSTOMER", "SUPERVISOR", "AGENT"] as Array<"CUSTOMER" | "SUPERVISOR" | "AGENT"> } }
    : { deletedAt: null, isActive: true, role: input.audience === "CUSTOMERS" ? "CUSTOMER" as const : input.audience === "STAFF" ? { in: ["SUPERVISOR", "AGENT"] as Array<"SUPERVISOR" | "AGENT"> } : { in: ["CUSTOMER", "SUPERVISOR", "AGENT"] as Array<"CUSTOMER" | "SUPERVISOR" | "AGENT"> } };
  const users = await db.user.findMany({ where, select: { id: true, name: true, email: true, phone: true } });
  if (!users.length) throw new AppError(404, "RECIPIENT_NOT_FOUND", "Bu seçim için etkin alıcı bulunamadı.");
  const stored = await db.announcement.create({ data: { authorId: actor.id, title: input.title, body: input.body, audience: input.audience, priority: input.priority, eventAt: input.eventAt ? new Date(input.eventAt) : null, attachments: { create: files.map(file => ({ ...file })) } } });
  const settings = await db.integrationSettings.findUnique({ where: { id: "default" } });
  const requestedChannels = [...new Set(input.channels)];
  let delivered = 0;
  for (const user of users) {
    const successful: string[] = [];
    const errors: string[] = [];
    for (const channel of requestedChannels) {
      try {
        if (channel === "APP") {
          await db.notification.create({ data: { userId: user.id, type: "ANNOUNCEMENT", title: input.title, message: input.body.slice(0, 1000) } });
        } else if (channel === "EMAIL") {
          if (!settings?.smtpEnabled || !user.email) throw new Error(!user.email ? "Alıcının e-posta adresi yok." : "SMTP e-posta entegrasyonu etkin değil.");
          await sendAnnouncementEmail(user.email, input.title, input.body);
        } else {
          if (!settings?.smsEnabled || !user.phone) throw new Error(!user.phone ? "Alıcının telefon numarası yok." : "SMS entegrasyonu etkin değil.");
          await sendAnnouncementSms(user.phone, `${input.title}\n\n${input.body}`.slice(0, 1500));
        }
        successful.push(channel);
      } catch (error) { errors.push(`${channelNames[channel]}: ${error instanceof Error ? error.message : "Gönderim başarısız."}`); }
    }
    if (successful.length) delivered++;
    await db.announcementDelivery.create({ data: { announcementId: stored.id, userId: user.id, channels: JSON.stringify(successful), status: successful.length === requestedChannels.length ? "SENT" : successful.length ? "PARTIAL" : "FAILED", error: errors.join("\n") || null } });
  }
  await db.activityLog.create({ data: { userId: actor.id, action: "announcement.sent", entityType: "Announcement", entityId: stored.id, metadata: { recipientCount: users.length, deliveredCount: delivered, channels: requestedChannels } } });
  if (input.saveTemplate) await saveTemplate(actor, { title: input.title, body: input.body, priority: input.priority });
  publishChange();
  return { id: stored.id, recipientCount: users.length, deliveredCount: delivered, failedCount: users.length - delivered };
}

export async function attachment(actor: Actor, id: string) {
  const file = await db.announcementAttachment.findUnique({ where: { id } });
  if (!file) throw new AppError(404, "NOT_FOUND", "Duyuru eki bulunamadı.");
  if (actor.role !== "ADMIN") {
    const owns = await db.announcementDelivery.count({ where: { announcementId: file.announcementId, userId: actor.id, channels: { contains: "APP" } } });
    if (!owns) throw new AppError(404, "NOT_FOUND", "Duyuru eki bulunamadı.");
  }
  return { ...file, path: path.join(uploadRoot, file.storageKey) };
}

export async function saveTemplate(actor: Actor, input: { title: string; body: string; priority: string }) {
  requireAdmin(actor);
  return db.announcementTemplate.create({ data: { ...input, authorId: actor.id } });
}

export async function deleteTemplate(actor: Actor, id: string) {
  requireAdmin(actor);
  await db.announcementTemplate.delete({ where: { id } });
  return { deleted: true };
}

export async function remove(actor: Actor, id: string) {
  requireAdmin(actor);
  const announcement = await db.announcement.findUnique({ where: { id }, include: { attachments: true } });
  if (!announcement) throw new AppError(404, "NOT_FOUND", "Duyuru bulunamadı.");
  await db.announcement.delete({ where: { id } });
  await Promise.allSettled(announcement.attachments.map(file => unlink(path.join(uploadRoot, file.storageKey))));
  return { deleted: true };
}
