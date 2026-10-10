import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import * as auth from "../services/auth.service.js";
import * as conversations from "../services/conversations.service.js";
import {
  createConversationSchema,
  createStaffConversationSchema,
  idSchema,
  listSchema,
  loginSchema,
  messageSchema,
  paginationSchema,
  registerSchema,
  updateConversationSchema,
} from "../validators/index.js";
import { env, allowedOrigins } from "../config/env.js";
import { db } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import path from 'node:path';
import { upload, uploadRoot, withStoredUploads } from '../services/uploads.service.js';
import { managementRouter } from './management.js';
import { announcementsRouter } from './announcements.js';
import { surveysRouter } from './surveys.js';
import { rolesRouter } from './roles.js';
import { enforceRolePermissions } from '../middleware/permissions.js';
import { publishChange } from '../services/events.service.js';
import { receiveMetaWebhook, receiveNetgsmMessage, verifyMetaWebhook } from '../services/integrations.service.js';
export const router = Router();
const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/v1/auth",
  maxAge: 7 * 86400000,
};
function sendSession(
  res: Response,
  result: Awaited<ReturnType<typeof auth.login>>,
  status = 200,
) {
  res
    .cookie("refreshToken", result.refreshToken, cookieOptions)
    .status(status)
    .json({
      success: true,
      data: { accessToken: result.accessToken, user: result.user },
    });
}
const authLimiter = rateLimit({
  windowMs: 2 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  // Oturum yenileme sayfa açılışında otomatik çalışır; bunu giriş denemesi gibi sayma.
  skip: (req) => env.NODE_ENV === "test" || req.path === "/refresh" || req.path === "/logout",
  message: {
    success: false,
    error: {
      code: "RATE_LIMITED",
      message: "Çok fazla deneme. Lütfen daha sonra tekrar deneyin.",
    },
  },
});
router.use("/auth", authLimiter, (req, _res, next) => {
  if (
    req.method !== "GET" &&
    req.headers.origin &&
    !allowedOrigins.has(req.headers.origin)
  )
    throw new AppError(
      403,
      "INVALID_ORIGIN",
      "İstek kaynağına izin verilmiyor.",
    );
  next();
});
router.post("/auth/register", async (req, res) =>
  sendSession(res, await auth.register(registerSchema.parse(req.body)), 201),
);
router.post("/auth/login", async (req, res) =>
  sendSession(res, await auth.login(loginSchema.parse(req.body))),
);
router.post("/auth/refresh", async (req, res) => {
  const token = z.string().min(1).safeParse(req.cookies?.refreshToken);
  if (!token.success)
    throw new AppError(401, "UNAUTHENTICATED", "Oturum açmanız gerekiyor.");
  sendSession(res, await auth.refresh(token.data));
});
router.post("/auth/logout", async (req, res) => {
  await auth.logout(
    typeof req.cookies?.refreshToken === "string"
      ? req.cookies.refreshToken
      : undefined,
  );
  res
    .clearCookie("refreshToken", { ...cookieOptions, maxAge: undefined })
    .json({ success: true, data: null });
});
router.get('/public/settings',async(_req,res)=>{const settings=await db.integrationSettings.findUnique({where:{id:'default'},select:{smtpEnabled:true,smtpFromAddress:true}});res.json({success:true,data:{supportEmail:settings?.smtpEnabled?settings.smtpFromAddress:''}});});
router.post('/webhooks/netgsm', async (req, res) => res.status(202).json({ success: true, data: { conversationId: await receiveNetgsmMessage(req.body, typeof req.headers['x-webhook-token'] === 'string' ? req.headers['x-webhook-token'] : typeof req.query.token === 'string' ? req.query.token : undefined) } }));
router.get('/webhooks/whatsapp', async (req, res) => {
  const challenge = await verifyMetaWebhook(typeof req.query['hub.mode'] === 'string' ? req.query['hub.mode'] : undefined, typeof req.query['hub.verify_token'] === 'string' ? req.query['hub.verify_token'] : undefined, typeof req.query['hub.challenge'] === 'string' ? req.query['hub.challenge'] : undefined);
  if (challenge === null) throw new AppError(403, 'INVALID_WEBHOOK', 'WhatsApp webhook doğrulaması başarısız.');
  res.status(200).send(challenge);
});
router.post('/webhooks/whatsapp', async (req, res) => {
  // Do not log request bodies, phone numbers, signatures or credentials.
  console.log('[WhatsApp webhook] İstek alındı');
  try {
    const ids = await receiveMetaWebhook(req.body, typeof req.headers['x-hub-signature-256'] === 'string' ? req.headers['x-hub-signature-256'] : undefined, (req as any).rawBody);
    console.log('[WhatsApp webhook] İşlem tamamlandı', { processedMessages: ids.length, conversationIds: [...new Set(ids)] });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[WhatsApp webhook] İşlem başarısız', {
      code: error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNKNOWN',
      // Prisma messages can contain query arguments. Only application errors
      // have safe, fixed descriptions here.
      reason: error instanceof AppError ? error.message : 'Mesaj işlenirken sunucu/veritabanı hatası oluştu.',
    });
    throw error;
  }
});
router.use(authenticate);
router.get('/communication-channels', async (_req, res) => {
  const settings = await db.integrationSettings.findUnique({ where: { id: 'default' }, select: { smsEnabled: true, whatsappEnabled: true, smtpEnabled: true, smtpHost: true, smtpFromAddress: true, smtpUser: true, smtpPassword: true } });
  const hasStoredSmtpConfig = Boolean(settings && (settings.smtpHost || settings.smtpFromAddress || settings.smtpUser || settings.smtpPassword));
  const emailEnabled = (hasStoredSmtpConfig ? Boolean(settings?.smtpEnabled) : true)
    && Boolean(settings?.smtpHost || env.SMTP_HOST)
    && Boolean(settings?.smtpFromAddress || env.SMTP_FROM);
  res.json({ success: true, data: { EMAIL: emailEnabled, SMS: Boolean(settings?.smsEnabled), WHATSAPP: Boolean(settings?.whatsappEnabled) } });
});
// Keep saved links and API clients working while Conversation is the canonical resource.
router.use((req, _res, next) => {
  if (req.url === '/tickets' || req.url.startsWith('/tickets?') || req.url.startsWith('/tickets/'))
    req.url = req.url.replace(/^\/tickets/, '/conversations');
  next();
});
router.use((req,res,next)=>{if(req.method!=='GET')res.on('finish',()=>{if(res.statusCode<400&&!req.path.startsWith('/conversations'))publishChange();});next();});
router.use(enforceRolePermissions);
router.use(rolesRouter);
router.use(managementRouter);
router.use('/announcements', announcementsRouter);
router.use('/surveys', surveysRouter);
router.get("/auth/me", (req, res) => {
  const { sessionId, ...user } = req.actor;
  res.json({ success: true, data: user });
});
router.get('/departments',async(req,res)=>{
  const {page,limit}=paginationSchema.parse(req.query);
  const includeInactive=z.enum(['true','false']).optional().parse(req.query.includeInactive)==='true';
  if(includeInactive&&req.actor.role!=='ADMIN')throw new AppError(403,'FORBIDDEN','Yetkiniz yok.');
  const accessibleOnly=z.enum(['true','false']).optional().parse(req.query.accessible)==='true';
  const search=z.string().max(100).optional().parse(req.query.search);
  const scope = req.actor.accessRole?.scope ?? req.actor.roleScope ?? (req.actor.role === 'ADMIN' ? 'ALL' : 'DEPARTMENT');
  const where={deletedAt:null,...(includeInactive?{}:{isActive:true}),...(accessibleOnly&&scope!=='ALL' ? {id:{in:req.actor.departmentIds}} : {}),...(search?{name:{contains:search}}:{})};
  const data=await db.department.findMany({where,orderBy:{name:'asc'},skip:(page-1)*limit,take:limit});
  const total=await db.department.count({where});
  res.json({success:true,data,pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}});
});
router.post("/departments", authorize("ADMIN", "SUPERVISOR", "AGENT"), async (req, res) => {
  const input = z
    .object({ name: z.string().trim().min(2).max(100) })
    .strict()
    .parse(req.body);
  const data = await db.$transaction(async (tx) => {
    const existing = await tx.department.findUnique({ where: { name: input.name } });
    if (existing?.isActive && !existing.deletedAt) throw new AppError(409, 'DEPARTMENT_EXISTS', 'Bu isimde aktif bir departman zaten mevcut.');
    const department = existing
      ? await tx.department.update({ where: { id: existing.id }, data: { isActive: true, deletedAt: null } })
      : await tx.department.create({ data: input });
    await tx.activityLog.create({
      data: {
        userId: req.actor.id,
        action: existing ? 'department.restored' : 'department.created',
        entityType:'Department',
        entityId: department.id,
        ipAddress:req.actor.ipAddress,
      },
    });
    return department;
  });
  res.status(201).json({ success: true, data });
});
router.get("/agents", authorize("ADMIN", "SUPERVISOR"), async (req, res) => {
  const departmentId = idSchema.parse(req.query.departmentId);
  if (
    req.actor.role === "SUPERVISOR" &&
    !req.actor.departmentIds.includes(departmentId)
  )
    throw new AppError(403, "FORBIDDEN", "Departmana erişiminiz yok.");
  const {page,limit}=paginationSchema.parse(req.query);
  const search=z.string().max(100).optional().parse(req.query.search);
  const where={OR:[{role:'AGENT' as const},{accessRoleId:{not:null}}],isActive:true,departments:{some:{departmentId}},...(search?{name:{contains:search}}:{})};
  const total=await db.user.count({where});
  res.json({
    success: true,
    data: await db.user.findMany({
      where,
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
      take: limit,skip:(page-1)*limit,
    }),
    pagination:{page,limit,total,totalPages:Math.ceil(total/limit)},
  });
});
router.get("/dashboard", async (req, res) =>
  res.json({ success: true, data: await conversations.summary(req.actor) }),
);
router.get("/conversations", async (req, res) =>
  res.json({
    success: true,
    ...(await conversations.listConversations(req.actor, listSchema.parse(req.query))),
  }),
);
const uploadLimiter=rateLimit({windowMs:60000,limit:30,keyGenerator:req=>req.actor.id,standardHeaders:'draft-8',legacyHeaders:false,message:{success:false,error:{code:'RATE_LIMITED',message:'Çok fazla dosya isteği.'}}});
router.post("/conversations", uploadLimiter,upload,async (req, res) =>
  res.status(201).json({
    success: true,
    data: await withStoredUploads(req.files as Express.Multer.File[],files=>conversations.createConversation(req.actor,(req.actor.role==='CUSTOMER'?createConversationSchema:createStaffConversationSchema).parse(req.body),files)),
  }),
);
router.post('/conversations/:id/assign-to-me',async(req,res)=>res.json({success:true,data:await conversations.assignToMe(req.actor,idSchema.parse(req.params.id))}));
router.get("/conversations/:id", async (req, res) =>
  res.json({
    success: true,
    data: await conversations.getConversation(req.actor, idSchema.parse(req.params.id)),
  }),
);
router.patch(["/conversations/:id","/conversations/:id/status","/conversations/:id/priority","/conversations/:id/assign"], async (req, res) =>
  res.json({
    success: true,
    data: await conversations.updateConversation(
      req.actor,
      idSchema.parse(req.params.id),
      updateConversationSchema.parse(req.body),
    ),
  }),
);
router.get('/conversations/:id/history', async (req, res) => {
  const { page, limit } = paginationSchema.parse(req.query);
  res.json({ success: true, ...(await conversations.history(req.actor, idSchema.parse(req.params.id), page, limit)) });
});
router.get("/conversations/:id/messages", async (req, res) => {
  const { page, limit } = paginationSchema.parse(req.query);
  res.json({
    success: true,
    ...(await conversations.messages(
      req.actor,
      idSchema.parse(req.params.id),
      page,
      limit,
    )),
  });
});
router.get("/conversations/:id/mention-candidates", async (req, res) => {
  const query = z.object({
    search: z.string().trim().max(50).default(""),
    limit: z.coerce.number().int().min(1).max(8).default(6),
  }).parse(req.query);
  res.json({ success: true, data: await conversations.mentionCandidates(req.actor, idSchema.parse(req.params.id), query.search, query.limit) });
});
router.post("/conversations/:id/messages",uploadLimiter,async(req,_res,next)=>{await conversations.getConversation(req.actor,idSchema.parse(req.params.id));next();},upload, async (req, res) =>
  res.status(201).json({
    success: true,
    data: await withStoredUploads(req.files as Express.Multer.File[],files=>conversations.addMessage(req.actor,idSchema.parse(req.params.id),messageSchema.parse(req.body),files)),
  }),
);
router.delete('/conversations',async(req,res)=>res.json({success:true,data:await conversations.deleteConversations(req.actor,z.enum(['day','week','month','all']).parse(req.query.period))}));
router.delete('/conversations/:id',async(req,res)=>{await conversations.deleteConversation(req.actor,idSchema.parse(req.params.id));res.json({success:true,data:null});});
router.get('/attachments/:id',async(req,res,next)=>{
  const attachment=await db.conversationAttachment.findFirst({where:{id:idSchema.parse(req.params.id),message:{conversation:{is:conversations.visibility(req.actor)},...(req.actor.role==='CUSTOMER'?{type:{not:'INTERNAL_NOTE'}}:{})}}});
  if(!attachment)throw new AppError(404,'NOT_FOUND','Dosya bulunamadı.');
  const storageKey=idSchema.parse(attachment.storageKey);
  res.setHeader('Cache-Control','private, no-store');
  res.type(attachment.mimeType);
  res.download(path.join(uploadRoot,storageKey),attachment.originalName,error=>{if(error&&!res.headersSent)next(new AppError(404,'NOT_FOUND','Dosya bulunamadı.'));});
});
