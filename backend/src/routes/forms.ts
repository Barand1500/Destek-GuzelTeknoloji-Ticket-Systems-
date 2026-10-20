import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import path from 'node:path';
import type { Prisma } from '../generated/prisma/client.js';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import { allowedOrigins } from '../config/env.js';
import { emailSchema } from '../utils/email.js';
import { AppError } from '../utils/errors.js';
import { authorizeForm } from '../services/form-access.service.js';
import { getFormSettings, requireOpenForm, requestFormLink, submitForm, formSubmissionSchema } from '../services/forms.service.js';
import { verifyTurnstile, publicAuthSecurity } from '../services/turnstile.service.js';
import { withStoredUploads, uploadRoot } from '../services/uploads.service.js';
import { addMessage } from '../services/conversations.service.js';
import { requestFormLogin, verifyFormLogin } from '../services/form-login.service.js';

export const formsRouter = Router();
// Shared by messages, pagination cursors and attachment downloads.
const formMessageVisibility = {
  AND: [{ OR: [{ type: 'CUSTOMER_MESSAGE' }, { type: 'AGENT_REPLY', visibleInForm: true }] }],
} satisfies Prisma.ConversationMessageWhereInput;
const limitMessage = { success: false, error: { code: 'RATE_LIMITED', message: 'Çok fazla deneme. Lütfen daha sonra yeniden deneyin.' } };
const writes = rateLimit({ windowMs: 10 * 60_000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false, message: limitMessage });
const reads = rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: 'draft-8', legacyHeaders: false, message: limitMessage });
const replies = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false, message: limitMessage });
const formFileSize = Math.min(env.MAX_FILE_SIZE, 5 * 1024 * 1024);
// Eight application fields, plus the hidden field sent by older Turnstile clients.
const parseAttachments = multer({ storage: multer.memoryStorage(), limits: { files: 3, fileSize: formFileSize, fields: 9, parts: 13, fieldSize: 40000 } }).array('files', 3);
const attachments: RequestHandler = (req, res, next) => parseAttachments(req, res, error => {
  if (!(error instanceof multer.MulterError)) { next(error); return; }
  const message = error.code === 'LIMIT_FILE_SIZE' ? `Dosya başına sınır ${Number((formFileSize / 1024 / 1024).toFixed(2))} MB.`
    : error.code === 'LIMIT_FILE_COUNT' || (error.code === 'LIMIT_UNEXPECTED_FILE' && error.field === 'files') ? 'En fazla 3 dosya ekleyebilirsiniz.'
    : error.code === 'LIMIT_FIELD_COUNT' || error.code === 'LIMIT_PART_COUNT' ? 'Formda çok fazla alan gönderildi. Sayfayı yenileyip yeniden deneyin.'
    : error.code === 'LIMIT_FIELD_VALUE' ? 'Formdaki bir alan çok uzun.'
    : 'Dosya alanı geçersiz. Sayfayı yenileyip yeniden deneyin.';
  next(new AppError(400, 'UPLOAD_LIMIT', message));
});
formsRouter.use((req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  // Embedded forms still make same-origin requests from our own iframe.
  if (req.method !== 'GET' && req.headers.origin && !allowedOrigins.has(req.headers.origin)) throw new AppError(403, 'INVALID_ORIGIN', 'İstek kaynağına izin verilmiyor.');
  next();
});
formsRouter.get('/settings', reads, async (_req, res) => {
  const settings = await getFormSettings();
  const departments = settings.enabled ? await db.department.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }) : [];
  res.json({ success: true, data: { enabled: settings.enabled, title: settings.title, departments, security: publicAuthSecurity(), maxFiles: 3, maxFileSize: Math.min(env.MAX_FILE_SIZE, 5 * 1024 * 1024) } });
});
formsRouter.post('/requests', writes, async (_req, _res, next) => { await requireOpenForm(); next(); }, attachments, async (req, res) => {
  const { 'cf-turnstile-response': widgetToken, ...body } = req.body;
  const input = formSubmissionSchema.parse({ ...body, turnstileToken: body.turnstileToken ?? widgetToken });
  await verifyTurnstile(input.turnstileToken, 'form_submit', req.ip);
  const result = await withStoredUploads(req.files as Express.Multer.File[], files => submitForm(input, files, req.ip));
  res.status(201).json({ success: true, data: result });
});
formsRouter.post('/access', writes, async (req, res) => {
  const input = z.object({ email: emailSchema, number: z.coerce.number().int().positive(), turnstileToken: z.string().max(2048).optional() }).strict().parse(req.body);
  await verifyTurnstile(input.turnstileToken, 'form_access', req.ip);
  await requestFormLink(input.email, input.number);
  res.json({ success: true, data: { message: 'Bilgiler eşleşiyorsa takip bağlantısı e-posta adresinize gönderildi.' } });
});
formsRouter.post('/login', writes, async (req, res) => {
  const input = z.object({ email: emailSchema, number: z.coerce.number().int().positive().max(2147483647), turnstileToken: z.string().max(2048).optional() }).strict().parse(req.body);
  await verifyTurnstile(input.turnstileToken, 'form_access', req.ip);
  res.json({ success: true, data: { ...await requestFormLogin(input.email, input.number), message: 'Bilgiler eşleşiyorsa giriş kodu e-posta adresinize gönderildi.' } });
});
formsRouter.post('/login/verify', writes, async (req, res) => {
  const input = z.object({ challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/) }).strict().parse(req.body);
  res.json({ success: true, data: await verifyFormLogin(input.challengeId, input.code) });
});
formsRouter.use('/conversation', reads, async (req, _res, next) => {
  const conversation = await authorizeForm(typeof req.headers['x-form-token'] === 'string' ? req.headers['x-form-token'] : undefined);
  req.actor = { id: conversation.customerId, name: conversation.formRequest?.name ?? conversation.customer.name, email: conversation.formRequest?.email ?? conversation.customer.email ?? '', role: 'CUSTOMER', departmentIds: [], sessionId: '', ipAddress: req.ip };
  _res.locals.formConversation = conversation;
  next();
});
formsRouter.get('/conversation', async (req, res) => {
  const conversation = res.locals.formConversation;
  const before = z.uuid().optional().parse(req.query.before), after = z.uuid().optional().parse(req.query.after);
  if (before && after) throw new AppError(400, 'INVALID_CURSOR', 'Geçersiz mesaj aralığı.');
  const cursorId = before ?? after;
  const cursor = cursorId ? await db.conversationMessage.findFirst({ where: { id: cursorId, conversationId: conversation.id, ...formMessageVisibility }, select: { id: true, createdAt: true } }) : null;
  if (cursorId && !cursor) throw new AppError(400, 'INVALID_CURSOR', 'Mesaj bulunamadı.');
  const order = after ? 'asc' : 'desc';
  const messages = await db.conversationMessage.findMany({ where: { conversationId: conversation.id, ...formMessageVisibility, ...(cursor ? { OR: [{ createdAt: after ? { gt: cursor.createdAt } : { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: after ? { gt: cursor.id } : { lt: cursor.id } }] } : {}) }, select: { id: true, body: true, type: true, createdAt: true, author: { select: { name: true } }, attachments: { select: { id: true, originalName: true, size: true } } }, orderBy: [{ createdAt: order }, { id: order }], take: 51 });
  const status = await db.statusOption.findUnique({ where: { code: conversation.status }, select: { name: true } });
  res.json({ success: true, data: { number: conversation.number, subject: conversation.subject, status: status?.name ?? conversation.status, closed: conversation.status === 'CLOSED', messages: after ? messages.slice(0, 50) : messages.slice(0, 50).reverse(), hasMore: messages.length > 50, direction: after ? 'after' : before ? 'before' : 'latest' } });
});
formsRouter.post('/conversation/messages', replies, attachments, async (req, res) => {
  const input = z.object({ body: z.string().trim().max(10000) }).strict().parse(req.body);
  await withStoredUploads(req.files as Express.Multer.File[], files => addMessage(req.actor, res.locals.formConversation.id, input, files));
  res.status(201).json({ success: true });
});
formsRouter.get('/conversation/attachments/:id', async (req, res) => {
  const file = await db.conversationAttachment.findFirst({ where: { id: z.uuid().parse(req.params.id), message: { conversationId: res.locals.formConversation.id, ...formMessageVisibility } } });
  if (!file) throw new AppError(404, 'FILE_NOT_FOUND', 'Dosya bulunamadı.');
  res.download(path.join(uploadRoot, file.storageKey), file.originalName);
});
