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
export const statusSchema = z.string().trim().min(1).max(40).regex(/^[A-Z0-9_]+$/);
export const prioritySchema = z.string().trim().min(1).max(40).regex(/^[A-Z0-9_]+$/);
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const listSchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  departmentId: idSchema.optional(),
  tagId: idSchema.optional(),
  assignedAgentId: idSchema.optional(),
  customerId: idSchema.optional(),
  channel: z.enum(['TICKET','EMAIL','LIVE_CHAT']).optional(),
  category: z.string().trim().min(1).max(40).regex(/^[A-Z0-9_]+$/).optional(),
  view: z.enum(["all", "mine", "unassigned", "open", "pending", "resolved", "closed", "urgent"]).default("all"),
});
export const createConversationSchema = z
  .object({
    channel: z.literal('TICKET').default('TICKET'),
    subject: z.string().trim().min(5).max(200),
    message: z.string().trim().min(1).max(10000),
    websiteUrl: z.string().trim().url().max(500).optional(),
    websiteId: idSchema.optional(),
    assignedAgentId: idSchema.optional(),
    departmentId: idSchema,
    priority: prioritySchema.default("NORMAL"),
    tagIds: z.array(idSchema).max(20).optional(),
  })
  .strict();
export const createStaffConversationSchema = createConversationSchema.extend({
  customerId: idSchema,
}).strict();
export const messageSchema = z
  .object({
    body: z.string().trim().min(1).max(10000),
    type: z.enum(['CUSTOMER_MESSAGE','AGENT_REPLY','INTERNAL_NOTE']).optional(),
    isInternalNote: z.preprocess(v=>v==='true'?true:v==='false'?false:v,z.boolean()).optional(),
  })
  .strict();
export const updateConversationSchema = z
  .object({
    status: statusSchema.optional(),
    priority: prioritySchema.optional(),
    assignedAgentId: idSchema.nullable().optional(),
    departmentId: idSchema.optional(),
    websiteId: idSchema.nullable().optional(),
    tagIds: z.array(idSchema).max(20).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0);
