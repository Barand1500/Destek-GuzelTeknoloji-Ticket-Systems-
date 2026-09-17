import { z } from "zod";
export const idSchema = z.uuid();
const password = z
  .string()
  .min(10)
  .max(72)
  .refine(
    (v) => Buffer.byteLength(v, "utf8") <= 72,
    "Şifre en fazla 72 bayt olabilir.",
  );
export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    password: z.string().min(1).max(200),
  })
  .strict();
export const registerSchema = loginSchema.extend({
  name: z.string().trim().min(2).max(100),
  password,
});
export const statusSchema = z.enum([
  "OPEN",
  "PENDING",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
]);
export const prioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const listSchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  departmentId: idSchema.optional(),
  assignedAgentId: idSchema.optional(),
  view: z.enum(["all", "mine", "unassigned"]).default("all"),
});
export const createTicketSchema = z
  .object({
    subject: z.string().trim().min(5).max(200),
    message: z.string().trim().min(1).max(10000),
    departmentId: idSchema,
    priority: prioritySchema.default("NORMAL"),
  })
  .strict();
export const messageSchema = z
  .object({
    body: z.string().trim().min(1).max(10000),
    isInternalNote: z.boolean().default(false),
  })
  .strict();
export const updateTicketSchema = z
  .object({
    status: statusSchema.optional(),
    priority: prioritySchema.optional(),
    assignedAgentId: idSchema.nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0);
