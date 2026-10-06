import path from "node:path";
import type { z } from "zod";
import { db } from "../config/db.js";
import { env } from "../config/env.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { Actor } from "../types/express.js";
import { AppError } from "../utils/errors.js";
import type { announcementSchema } from "../validators/announcements.js";
import { uploadRoot, type StoredUpload } from "./uploads.service.js";
import { publishChange } from "./events.service.js";
import { sendChannelReply } from "./integrations.service.js";
import { sendSupportEmail } from "./mailer.service.js";

const staffWhere = (actor: Actor): Prisma.UserWhereInput => ({
  role: { in: ["ADMIN", "SUPERVISOR", "AGENT"] },
  isActive: true,
  deletedAt: null,
  ...(actor.role !== "ADMIN"
    ? {
        departments: {
          some: {
            departmentId: { in: actor.departmentIds },
            department: { isActive: true, deletedAt: null },
          },
        },
      }
    : {}),
});
const visible = (actor: Actor): Prisma.AnnouncementWhereInput =>
  actor.role === "ADMIN"
    ? {}
    : {
        OR: [
          { authorId: actor.id },
          { deliveries: { some: { userId: actor.id } } },
        ],
      };

export async function announcementDirectory(actor: Actor) {
  const [people, departments, settings] = await Promise.all([
    db.user.findMany({
      where: staffWhere(actor),
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        departments: { select: { departmentId: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.department.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(actor.role !== "ADMIN" ? { id: { in: actor.departmentIds } } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.integrationSettings.findUnique({ where: { id: "default" } }),
  ]);
  const storedSmtp = Boolean(
    settings &&
    (settings.smtpHost ||
      settings.smtpFromAddress ||
      settings.smtpUser ||
      settings.smtpPassword),
  );
  return {
    people: people.map(({ departments, ...person }) => ({
      ...person,
      departmentIds: departments.map((d) => d.departmentId),
    })),
    departments,
    smsEnabled: Boolean(settings?.smsEnabled),
    emailEnabled: storedSmtp
      ? Boolean(
          settings?.smtpEnabled &&
          settings.smtpHost &&
          settings.smtpFromAddress,
        )
      : Boolean(env.SMTP_HOST && env.SMTP_FROM),
    maxFileSize: Math.min(env.MAX_FILE_SIZE, 10 * 1024 * 1024),
  };
}

const include = {
  deliveries: {
    select: {
      userId: true,
      recipientName: true,
      channel: true,
      status: true,
      error: true,
    },
  },
} as const;
type Row = Prisma.AnnouncementGetPayload<{ include: typeof include }>;
function publicRow(row: Row, actor: Actor) {
  const canSeeRecipients = actor.role === "ADMIN" || row.authorId === actor.id;
  return {
    ...row,
    files: (row.files as StoredUpload[]).map((file, index) => ({
      index,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
    })),
    deliveries: canSeeRecipients
      ? row.deliveries
      : row.deliveries.filter((d) => d.userId === actor.id),
    recipientCount: canSeeRecipients
      ? new Set(row.deliveries.map((d) => d.userId)).size
      : undefined,
  };
}

export async function listAnnouncements(
  actor: Actor,
  page: number,
  limit: number,
  search = "",
) {
  const where: Prisma.AnnouncementWhereInput = {
    AND: [visible(actor), ...(search.trim() ? [{ OR: ["title", "body", "authorName", "departmentName"].map(field => ({ [field]: { contains: search.trim() } })) }] : [])],
  };
  const [data, total] = await Promise.all([
    db.announcement.findMany({
      where,
      include,
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.announcement.count({ where }),
  ]);
  return {
    data: data.map((row) => publicRow(row, actor)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function createAnnouncement(
  actor: Actor,
  input: z.infer<typeof announcementSchema>,
  files: StoredUpload[],
) {
  if (actor.role !== "ADMIN" && actor.role !== "SUPERVISOR")
    throw new AppError(
      403,
      "FORBIDDEN",
      "Duyuru yayınlamak için yönetici veya departman sorumlusu olmalısınız.",
    );
  if (files.some((file) => file.size > 10 * 1024 * 1024))
    throw new AppError(
      400,
      "INVALID_FILE",
      "Duyuru dosyaları en fazla 10 MB olabilir.",
    );
  const directory = await announcementDirectory(actor);
  const department = directory.departments.find(
    (d) => d.id === input.departmentId,
  );
  if (input.departmentId && !department)
    throw new AppError(
      403,
      "INVALID_DEPARTMENT",
      "Bu departmana duyuru gönderemezsiniz.",
    );
  if (input.channels.includes("SMS") && !directory.smsEnabled)
    throw new AppError(
      400,
      "SMS_NOT_CONFIGURED",
      "SMS entegrasyonu etkin değil.",
    );
  if (input.channels.includes("EMAIL") && !directory.emailEnabled)
    throw new AppError(
      400,
      "EMAIL_NOT_CONFIGURED",
      "E-posta entegrasyonu etkin değil.",
    );
  const scope = directory.people.filter(
    (p) => !input.departmentId || p.departmentIds.includes(input.departmentId),
  );
  const ids = new Set(input.recipientIds);
  if (
    input.recipientMode === "SELECTED" &&
    [...ids].some((id) => !scope.some((p) => p.id === id))
  )
    throw new AppError(
      403,
      "INVALID_RECIPIENT",
      "Seçilen kişiler hedef departmanınızda bulunmalıdır.",
    );
  const recipients =
    input.recipientMode === "SELECTED"
      ? scope.filter((p) => ids.has(p.id))
      : scope;
  if (!recipients.length)
    throw new AppError(
      400,
      "NO_RECIPIENTS",
      "Duyuru için en az bir aktif alıcı gerekiyor.",
    );
  const row = await db.$transaction(async (tx) => {
    const row = await tx.announcement.create({
      data: {
        authorId: actor.id,
        authorName: actor.name,
        title: input.title,
        body: input.body,
        priority: input.priority,
        departmentId: input.departmentId,
        departmentName: department?.name,
        eventAt: input.eventAt,
        pinned: input.pinned,
        files: files as unknown as Prisma.InputJsonValue,
        deliveries: {
          create: recipients.flatMap((person) =>
            input.channels.map((channel) => {
              const address =
                channel === "SMS"
                  ? person.phone
                  : channel === "EMAIL"
                    ? person.email
                    : null;
              const missing = channel !== "NOTIFICATION" && !address;
              return {
                userId: person.id,
                recipientName: person.name,
                channel,
                address,
                status: missing ? "FAILED" : "PENDING",
                error: missing
                  ? `${channel === "SMS" ? "Telefon" : "E-posta"} bilgisi eksik.`
                  : null,
              };
            }),
          ),
        },
      },
      include,
    });
    await tx.activityLog.create({
      data: {
        userId: actor.id,
        entityType: "Announcement",
        entityId: row.id,
        action: "announcement.created",
        metadata: {
          recipientCount: recipients.length,
          channels: input.channels,
        },
        ipAddress: actor.ipAddress,
      },
    });
    return row;
  });
  publishChange();
  return publicRow(row, actor);
}

export async function announcementFile(
  actor: Actor,
  id: string,
  index: number,
) {
  const row = await db.announcement.findFirst({
    where: { id, ...visible(actor) },
  });
  const file = row && (row.files as StoredUpload[])[index];
  if (!file) throw new AppError(404, "NOT_FOUND", "Duyuru dosyası bulunamadı.");
  return file;
}

let running = false;
export async function processAnnouncementQueue() {
  if (running) return;
  running = true;
  try {
    const pending = await db.announcementDelivery.findMany({
      where: { status: "PENDING" },
      include: { announcement: true },
      orderBy: { announcement: { createdAt: "asc" } },
      take: 20,
    });
    for (const delivery of pending) {
      const claimed = await db.announcementDelivery.updateMany({
        where: { id: delivery.id, status: "PENDING" },
        data: { status: "PROCESSING" },
      });
      if (!claimed.count) continue;
      const announcement = delivery.announcement;
      try {
        const user = await db.user.findFirst({
          where: { id: delivery.userId, isActive: true, deletedAt: null },
        });
        if (!user) throw new Error("Alıcı artık aktif değil.");
        const body = announcement.body.replaceAll(
          "{isim}",
          delivery.recipientName,
        );
        const eventText = announcement.eventAt
          ? `\n\nEtkinlik: ${announcement.eventAt.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}`
          : "";
        if (delivery.channel === "NOTIFICATION") {
          await db.$transaction(async (tx) => {
            await tx.notification.create({
              data: {
                userId: delivery.userId,
                type: "ANNOUNCEMENT",
                title: announcement.title,
                message: (body + eventText).slice(0, 180),
              },
            });
            await tx.announcementDelivery.update({
              where: { id: delivery.id },
              data: { status: "SENT" },
            });
          });
        } else {
          if (delivery.channel === "SMS")
            await sendChannelReply(
              "SMS",
              { phone: delivery.address },
              `${announcement.title}\n${body}${eventText}`,
            );
          else
            await sendSupportEmail(
              delivery.address!,
              announcement.title,
              body + eventText,
              undefined,
              (announcement.files as StoredUpload[]).map((file) => ({
                filename: file.originalName,
                path: path.join(uploadRoot, file.storageKey),
                contentType: file.mimeType,
              })),
            );
          await db.announcementDelivery.update({
            where: { id: delivery.id },
            data: { status: "SENT" },
          });
        }
      } catch (error) {
        await db.announcementDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "FAILED",
            error:
              error instanceof Error
                ? error.message.slice(0, 500)
                : "Gönderim başarısız.",
          },
        });
      }
    }
    if (pending.length) publishChange();
  } finally {
    running = false;
  }
}

export async function startAnnouncementQueue() {
  // A provider may have accepted a message before the process stopped. Avoid duplicate sends.
  await db.announcementDelivery.updateMany({
    where: { status: "PROCESSING" },
    data: {
      status: "UNKNOWN",
      error:
        "Sunucu gönderim sırasında yeniden başladı. Sonuç sağlayıcı üzerinden kontrol edilmelidir.",
    },
  });
  const tick = () =>
    void processAnnouncementQueue().catch((error) =>
      console.error("Duyuru kuyruğu işlenemedi:", error),
    );
  tick();
  const timer = setInterval(tick, 2000);
  timer.unref();
  return () => clearInterval(timer);
}
