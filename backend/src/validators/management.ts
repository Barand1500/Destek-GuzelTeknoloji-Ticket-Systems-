import { z } from "zod";
import { idSchema, paginationSchema, registerSchema } from "./index.js";

const role = z.enum(["ADMIN", "SUPERVISOR", "AGENT", "CUSTOMER"]);
const search = z.string().trim().max(100).optional();
const queryBoolean = z.enum(["true", "false"]).transform(v => v === "true").optional();
const nonempty = (v: object) => Object.keys(v).length > 0;
const departments = z.array(idSchema).max(100).refine(v => new Set(v).size === v.length, "Departmanlar tekrarlanamaz.");
export const directoryQuery = paginationSchema.extend({ search, id: idSchema.optional(), role: role.optional(), isActive: queryBoolean });
export const searchQuery = paginationSchema.extend({ search });
export const createUserSchema = registerSchema.extend({ role, departmentIds: departments.default([]) }).strict();
export const createCustomerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.preprocess(value => typeof value === "string" && !value.trim() ? undefined : value, z.string().trim().toLowerCase().pipe(z.email()).optional()),
  phone: z.string().trim().min(7).max(30),
  company: z.string().trim().min(2).max(120).optional(),
  staffNote: z.string().trim().min(1).max(2000).optional(),
  extraPhones: z.string().trim().max(500).optional(), extraEmails: z.string().trim().max(500).optional(),
}).strict();
export const updateCustomerSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().pipe(z.email())]).transform(value => value || null).optional(),
  phone: z.string().trim().min(7).max(30).optional(),
  company: z.union([z.literal(""), z.string().trim().min(2).max(120)]).transform(value => value || null).optional(),
  staffNote: z.union([z.literal(""), z.string().trim().min(1).max(2000)]).transform(value => value || null).optional(),
  isActive: z.boolean().optional(),
  extraPhones: z.string().trim().max(500).nullable().optional(), extraEmails: z.string().trim().max(500).nullable().optional(),
}).strict().refine(nonempty);
export const updateUserSchema = registerSchema.partial().extend({ role: role.optional(), isActive: z.boolean().optional(), departmentIds: departments.optional() }).strict().refine(nonempty);
export const departmentSchema = z.object({ name: z.string().trim().min(2).max(100).optional(), isActive: z.boolean().optional() }).strict().refine(nonempty);
export const tagSchema = z.object({ name: z.string().trim().min(1).max(50), code: z.string().trim().min(1).max(40).regex(/^[A-Z0-9_]+$/), color: z.string().regex(/^#[\da-fA-F]{6}$/).default("#64748b") }).strict();
export const updateTagSchema = tagSchema.partial().refine(nonempty);
const optionSchema = z.object({ name: z.string().trim().min(1).max(60), code: z.string().trim().min(1).max(40).regex(/^[A-Z0-9_]+$/), color: z.string().regex(/^#[\da-fA-F]{6}$/).default("#398571"), isActive: z.boolean().optional() }).strict();
export const statusOptionSchema = optionSchema;
export const updateStatusOptionSchema = optionSchema.partial().refine(nonempty);
export const priorityOptionSchema = optionSchema.extend({ color: z.string().regex(/^#[\da-fA-F]{6}$/).default("#64748b") });
export const updatePriorityOptionSchema = priorityOptionSchema.partial().refine(nonempty);
export const websiteSchema = z.object({ name: z.string().trim().min(2).max(100), url: z.string().trim().url().max(500), isActive: z.boolean().optional() }).strict();
export const updateWebsiteSchema = websiteSchema.partial().refine(nonempty);
export const savedReplySchema = z.object({ title: z.string().trim().min(2).max(100), body: z.string().trim().min(1).max(10000) }).strict();
export const updateSavedReplySchema = savedReplySchema.partial().refine(nonempty);
export const notificationQuery = paginationSchema.extend({ isRead: queryBoolean, search });
export const notificationDeleteQuery = z.object({ period: z.enum(["day", "week", "month", "all"]) });
export const notificationVisibleDeleteSchema = z.object({ ids: z.array(idSchema).min(1).max(100) });
export const activityQuery = paginationSchema.extend({ search, action: z.string().trim().max(100).optional(), userId: idSchema.optional() });
export const activityDeleteQuery = z.object({ period: z.enum(["day", "week", "month", "all"]) });
const integrationText = z.string().trim().max(500);
const integrationDepartment = z.union([idSchema, z.literal(""), z.null()]).transform(value => value || null);
export const integrationSettingsSchema = z.object({
  responseFastMinutes: z.number().int().min(1).max(1440), responseNormalMinutes: z.number().int().min(2).max(10080), responseFastColor: z.string().regex(/^#[\da-fA-F]{6}$/), responseNormalColor: z.string().regex(/^#[\da-fA-F]{6}$/), responseLateColor: z.string().regex(/^#[\da-fA-F]{6}$/), responseFastFromMinutes: z.number().int().min(0).max(10080), responseFastToMinutes: z.number().int().min(0).max(10080), responseNormalFromMinutes: z.number().int().min(0).max(10080), responseNormalToMinutes: z.number().int().min(0).max(10080), responseLateFromMinutes: z.number().int().min(0).max(10080), responseLateToMinutes: z.number().int().min(0).max(10080),
  smtpEnabled: z.boolean(), smtpHost: integrationText, smtpPort: z.number().int().min(1).max(65535), smtpSecure: z.boolean(), smtpUser: integrationText, smtpPassword: integrationText, smtpFromAddress: z.union([z.literal(""), z.string().trim().toLowerCase().pipe(z.email())]), smtpFromName: integrationText,
  imapEnabled: z.boolean(), imapConnectionName: integrationText, imapHost: integrationText, imapPort: z.number().int().min(1).max(65535), imapSecure: z.boolean(), imapAuthType: z.enum(["BASIC", "OAUTH2"]), imapUser: integrationText, imapPassword: integrationText, imapMailbox: z.string().trim().min(1).max(100), imapPollIntervalSeconds: z.number().int().min(15).max(3600), imapCreateTickets: z.boolean(), imapCreateReplies: z.boolean(), imapDepartmentId: integrationDepartment,
  smsEnabled: z.boolean(), smsApiUser: integrationText, smsApiPassword: integrationText, smsSender: integrationText, smsVirtualNumber: integrationText, smsWebhookSecret: integrationText, smsDepartmentId: integrationDepartment,
  whatsappEnabled: z.boolean(), whatsappAppId: integrationText, whatsappAppSecret: integrationText, whatsappPhoneNumberId: integrationText, whatsappAccessToken: integrationText, whatsappVerifyToken: integrationText, whatsappDepartmentId: integrationDepartment,
}).strict().refine(value => value.responseFastFromMinutes <= value.responseFastToMinutes && value.responseNormalFromMinutes <= value.responseNormalToMinutes && value.responseLateFromMinutes <= value.responseLateToMinutes, { message: "Her aralığın başlangıcı bitişinden büyük olamaz.", path: ["responseFastToMinutes"] }).refine(value => value.responseFastToMinutes < value.responseNormalFromMinutes && value.responseNormalToMinutes < value.responseLateFromMinutes, { message: "Yanıt süre aralıkları çakışamaz; hızlı, normal ve çok geç sırasıyla ilerlemelidir.", path: ["responseNormalFromMinutes"] });
export const integrationTestSchema = z.object({ channel: z.enum(["SMTP", "IMAP", "SMS", "WHATSAPP"]) }).strict();
export const responseTimeSettingsSchema = z.object({
  responseFastFromMinutes: z.number().int().min(0).max(10080), responseFastToMinutes: z.number().int().min(0).max(10080),
  responseNormalFromMinutes: z.number().int().min(0).max(10080), responseNormalToMinutes: z.number().int().min(0).max(10080),
  responseLateFromMinutes: z.number().int().min(0).max(10080), responseLateToMinutes: z.number().int().min(0).max(10080),
  responseFastColor: z.string().regex(/^#[\da-fA-F]{6}$/), responseNormalColor: z.string().regex(/^#[\da-fA-F]{6}$/), responseLateColor: z.string().regex(/^#[\da-fA-F]{6}$/),
}).strict().refine(value => value.responseFastFromMinutes <= value.responseFastToMinutes && value.responseNormalFromMinutes <= value.responseNormalToMinutes && value.responseLateFromMinutes <= value.responseLateToMinutes, { message: "Her aralığın başlangıcı bitişinden büyük olamaz.", path: ["responseFastToMinutes"] }).refine(value => value.responseFastToMinutes < value.responseNormalFromMinutes && value.responseNormalToMinutes < value.responseLateFromMinutes, { message: "Yanıt süre aralıkları çakışamaz; hızlı, normal ve çok geç sırasıyla ilerlemelidir.", path: ["responseNormalFromMinutes"] });
export const notificationSettingsSchema = z.object({ ticketCreatedSubject: z.string().trim().min(1).max(191), ticketCreatedBody: z.string().trim().min(1).max(10000), ticketReplySubject: z.string().trim().min(1).max(191), ticketReplyBody: z.string().trim().min(1).max(10000) }).strict();
export const profileSchema = registerSchema.partial().extend({ currentPassword: z.string().min(1).max(200).optional() }).strict().refine(v => Boolean(v.name || v.email || v.password));
