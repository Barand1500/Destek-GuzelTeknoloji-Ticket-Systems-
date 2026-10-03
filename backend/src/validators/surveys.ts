import { z } from "zod";

const question = z.discriminatedUnion("type", [
  z.object({ id: z.string().min(1).max(50), type: z.literal("SINGLE"), text: z.string().trim().min(2).max(500), options: z.array(z.string().trim().min(1).max(200)).min(2).max(20) }),
  z.object({ id: z.string().min(1).max(50), type: z.literal("MULTIPLE"), text: z.string().trim().min(2).max(500), options: z.array(z.string().trim().min(1).max(200)).min(2).max(20) }),
  z.object({ id: z.string().min(1).max(50), type: z.literal("TEXT"), text: z.string().trim().min(2).max(500) }),
  z.object({ id: z.string().min(1).max(50), type: z.literal("RATING"), text: z.string().trim().min(2).max(500) }),
  z.object({ id: z.string().min(1).max(50), type: z.literal("YES_NO"), text: z.string().trim().min(2).max(500) }),
]);

export const createSurveySchema = z.object({
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(2000).default(""),
  durationDays: z.number().int().min(1).max(365),
  anonymous: z.boolean(),
  questions: z.array(question).min(1).max(30),
  departmentId: z.uuid().nullable(),
  recipientMode: z.enum(["ALL", "SELECTED"]),
  recipientIds: z.array(z.uuid()).max(2000),
  channels: z.array(z.enum(["NOTIFICATION", "SMS", "EMAIL"])).min(1).max(3),
}).strict();

export const surveyAnswersSchema = z.object({
  answers: z.record(z.string(), z.union([z.string().max(5000), z.array(z.string().max(500)).max(20), z.number().int().min(1).max(5), z.boolean()])),
}).strict();
