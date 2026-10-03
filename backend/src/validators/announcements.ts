import { z } from "zod";

export const announcementSchema = z
  .object({
    title: z.string().trim().min(2).max(180),
    body: z.string().trim().min(2).max(10000),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
    departmentId: z.uuid().nullable(),
    recipientMode: z.enum(["ALL", "SELECTED"]),
    recipientIds: z.array(z.uuid()).max(2000),
    channels: z
      .array(z.enum(["NOTIFICATION", "SMS", "EMAIL"]))
      .min(1)
      .max(3)
      .refine((v) => new Set(v).size === v.length),
    eventAt: z.iso.datetime({ offset: true }).nullable(),
    pinned: z.boolean(),
  })
  .strict()
  .refine((v) => v.recipientMode !== "SELECTED" || v.recipientIds.length > 0, {
    message: "En az bir alıcı seçin.",
    path: ["recipientIds"],
  });
