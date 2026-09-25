import { db } from "../config/db.js";
import { Prisma } from "../generated/prisma/client.js";
import type { Actor } from "../types/express.js";
import { AppError } from "../utils/errors.js";
import type { StoredUpload } from './uploads.service.js';
import { notifyConversation, publishChange } from './events.service.js';
import { queueSupportEmail } from './mailer.service.js';
import { sendChannelReply } from './integrations.service.js';
import type { z } from "zod";
import type {
  createConversationSchema,
  listSchema,
  messageSchema,
  updateConversationSchema,
} from "../validators/index.js";
const person = { id: true, name: true, email: true, phone: true, company: true, staffNote: true, extraPhones: true, extraEmails: true, role: true } as const;
const conversationInclude = {
  customer: { select: person },
  assignedAgent: { select: person },
  department: true,
  tags: {include:{tag:true}},
  website: true,
} as const;
const normalizeSearch = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("tr-TR");
async function supportContact() {
  const settings = await db.integrationSettings.findUnique({
    where: { id: "default" },
    select: { smtpEnabled: true, smtpFromAddress: true, smsEnabled: true, smsVirtualNumber: true },
  });
  return [
    settings?.smsEnabled && settings.smsVirtualNumber && `Telefon: ${settings.smsVirtualNumber}`,
    settings?.smtpEnabled && settings.smtpFromAddress && `E-posta: ${settings.smtpFromAddress}`,
  ].filter(Boolean).join("\n");
}
export function visibility(actor: Actor): Prisma.ConversationWhereInput {
  switch (actor.role) {
    case "ADMIN":
      return { deletedAt: null };
    case "CUSTOMER":
      return { deletedAt: null, customerId: actor.id };
    case "AGENT":
      return { deletedAt: null, OR: [{ assignedAgentId: actor.id }, { assignedAgentId: null, departmentId: { in: actor.departmentIds } }] };
    case "SUPERVISOR":
      return { deletedAt: null, departmentId: { in: actor.departmentIds } };
  }
}
export function mutationVisibility(actor: Actor): Prisma.ConversationWhereInput {
  return actor.role === 'AGENT' ? { deletedAt: null, assignedAgentId: actor.id } : visibility(actor);
}
export async function getConversation(actor: Actor, id: string) {
  const conversation = await db.conversation.findFirst({
    where: { AND: [visibility(actor), { id }] },
    include: conversationInclude,
  });
  if (!conversation)
    throw new AppError(
      404,
      "TICKET_NOT_FOUND",
      "Talep bulunamadı veya erişim yetkiniz yok.",
    );
  return conversation;
}
export async function listConversations(actor: Actor, q: z.infer<typeof listSchema>) {
  const normalizedSearch = q.search ? normalizeSearch(q.search) : "";
  const ticketNumber = q.search ? Number(q.search.replace(/\D/g, "")) : NaN;
  const filters: Prisma.ConversationWhereInput = {
    channel: q.channel,
    status: q.status,
    priority: q.priority,
    departmentId: q.departmentId,
  assignedAgentId: q.assignedAgentId,
    customerId: q.customerId,
    ...(q.tagId?{tags:{some:{tagId:q.tagId}}}:{}),
  };
  const categoryFilter: Prisma.ConversationWhereInput[] = q.category
    ? q.category === "EMAIL"
      ? [{ channel: "EMAIL" }]
      : q.category === "MINE"
        ? [{ assignedAgentId: actor.id }]
        : q.category === "UNASSIGNED"
          ? [{ assignedAgentId: null }]
          : q.category === "ALL"
            ? []
            : [{ tags: { some: { tag: { code: q.category } } } }]
    : [];
  const where: Prisma.ConversationWhereInput = {
    AND: [
      visibility(actor),
      filters,
      ...categoryFilter,
      ...(['open','pending','resolved','closed'].includes(q.view) ? [{ status: q.view.toUpperCase() as 'OPEN'|'PENDING'|'RESOLVED'|'CLOSED' }] : q.view === 'urgent' ? [{ priority: 'URGENT' as const }] : []),
      ...(q.view === "mine"
        ? [{ assignedAgentId: actor.id }]
        : q.view === "unassigned"
          ? [{ assignedAgentId: null }]
          : []),
      ...(q.search ? [{ OR: [
        { searchSubject: { contains: normalizedSearch } },
        ...(Number.isSafeInteger(ticketNumber) && ticketNumber > 0 ? [{ number: ticketNumber }] : []),
        { customer: { OR: [{ name: { contains: q.search } }, { email: { contains: q.search } }, { phone: { contains: q.search } }, { company: { contains: q.search } }] } },
        { assignedAgent: { is: { OR: [{ name: { contains: q.search } }, { email: { contains: q.search } }] } } },
      ] }] : []),
    ],
  };
  const [data, total] = await db.$transaction(
    async (tx) => {
      const data = await tx.conversation.findMany({
        where,
        include: conversationInclude,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      });
      const total = await tx.conversation.count({ where });
      const messageStats = data.length ? await tx.conversationMessage.groupBy({
        by: ["conversationId", "authorId", "type"],
        where: { conversationId: { in: data.map((conversation) => conversation.id) }, type: { in: ["CUSTOMER_MESSAGE", "AGENT_REPLY"] } },
        _count: { _all: true },
      }) : [];
      const statsByConversation = new Map<string, typeof messageStats>();
      for (const stat of messageStats) {
        const current = statsByConversation.get(stat.conversationId) ?? [];
        current.push(stat);
        statsByConversation.set(stat.conversationId, current);
      }
      const enriched = data.map((conversation) => {
        const stats = statsByConversation.get(conversation.id) ?? [];
        const customerStats = stats.filter((stat) => stat.type === "CUSTOMER_MESSAGE");
        const staffReplyStats = stats.filter((stat) => stat.type === "AGENT_REPLY");
        const assignedStats = conversation.assignedAgentId
          ? staffReplyStats.filter((stat) => stat.authorId === conversation.assignedAgentId)
          : [];
        return {
          ...conversation,
          customerMessageCount: customerStats.reduce((sum, stat) => sum + stat._count._all, 0),
          // An earlier reply can predate a reassignment. In that case, show the
          // conversation's staff-reply total instead of a misleading zero.
          assignedAgentMessageCount: (assignedStats.length ? assignedStats : staffReplyStats).reduce((sum, stat) => sum + stat._count._all, 0),
        };
      });
      return [enriched, total] as const;
    },
    { isolationLevel: "RepeatableRead" },
  );
  return {
    data,
    responseTimeRules: await db.responseTimeSettings.findUnique({ where: { id: "default" }, select: { responseFastFromMinutes: true, responseFastToMinutes: true, responseNormalFromMinutes: true, responseNormalToMinutes: true, responseLateFromMinutes: true, responseLateToMinutes: true, responseFastColor: true, responseNormalColor: true, responseLateColor: true } }) ?? { responseFastFromMinutes: 0, responseFastToMinutes: 15, responseNormalFromMinutes: 16, responseNormalToMinutes: 60, responseLateFromMinutes: 61, responseLateToMinutes: 10080, responseFastColor: "#16715d", responseNormalColor: "#a86606", responseLateColor: "#c2413c" },
    pagination: {
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.ceil(total / q.limit),
    },
  };
}
export async function createConversation(
  actor: Actor,
  input: z.infer<typeof createConversationSchema> & { customerId?: string },
  files:StoredUpload[] = [],
) {
  if (actor.role === "CUSTOMER" && input.customerId)
    throw new AppError(403, "FORBIDDEN", "Müşteri hesabıyla yalnızca kendi adınıza talep açabilirsiniz.");
  if (actor.role !== "CUSTOMER" && !input.customerId)
    throw new AppError(
      400, "CUSTOMER_REQUIRED", "Personel talebi için müşteri seçin.",
    );
  if (!(await db.department.findFirst({ where: { id: input.departmentId,isActive:true } })))
    throw new AppError(400, "INVALID_DEPARTMENT", "Departman bulunamadı.");
  const customerId=input.customerId??actor.id;
  if(actor.role!=='CUSTOMER'){
    if(actor.role!=='ADMIN'&&!actor.departmentIds.includes(input.departmentId))throw new AppError(403,'FORBIDDEN','Bu departmana talep açma yetkiniz yok.');
    const customer=await db.user.findFirst({where:{id:customerId,role:'CUSTOMER',isActive:true}});
    if(!customer)throw new AppError(400,'INVALID_CUSTOMER','Aktif bir müşteri seçin.');
  }
  const result=await db.$transaction(async (tx) => {
    if (!(await tx.priorityOption.findFirst({ where: { code: input.priority, isActive: true } }))) throw new AppError(400, "INVALID_PRIORITY", "Öncelik seçeneği geçersiz.");
    if(input.tagIds && (new Set(input.tagIds).size!==input.tagIds.length || await tx.tag.count({where:{id:{in:input.tagIds}}})!==input.tagIds.length)) throw new AppError(400,'INVALID_TAG','Etiketler geçersiz.');
    if (input.assignedAgentId && !(await tx.user.findFirst({ where: { id: input.assignedAgentId, role: { in: ["AGENT", "SUPERVISOR"] }, isActive: true, deletedAt: null, departments: { some: { departmentId: input.departmentId } } } }))) throw new AppError(400, "INVALID_ASSIGNEE", "Seçilen personel bu departmanda aktif değil.");
    const website = input.websiteId ? await tx.website.findFirst({ where: { id: input.websiteId, isActive: true } }) : null;
    if (input.websiteId && !website) throw new AppError(400, "INVALID_WEBSITE", "Geçerli bir web sitesi seçin.");
    const conversation = await tx.conversation.create({
      data: {
        subject: input.subject,
        websiteUrl: website?.url ?? input.websiteUrl,
        websiteId: website?.id,
        assignedAgentId: input.assignedAgentId,
        channel: input.channel,
        searchSubject: normalizeSearch(input.subject),
        departmentId: input.departmentId,
        priority: input.priority,
        customerId,
        ...(input.tagIds ? { tags: { create: input.tagIds.map(tagId => ({ tagId })) } } : {}),
        messages: { create: { authorId: customerId, body: input.message,type:'CUSTOMER_MESSAGE',attachments:{create:files.map(file=>({...file,uploaderId:actor.id}))} } },
      },
      include: conversationInclude,
    });
    await tx.activityLog.create({
      data: { userId: actor.id, action: "conversation.created", entityId: conversation.id, metadata: { subject: conversation.subject, number: conversation.number }, ipAddress:actor.ipAddress },
    });
    await notifyConversation(tx,actor,conversation,'CREATED','Yeni talep oluşturuldu');
    return conversation;
  });
  publishChange(result.id);
  if (result.customer.email) {
    const contact = await supportContact(); const template = await db.notificationSettings.upsert({ where: { id: "default" }, create: { id: "default", ticketCreatedSubject: "Talebiniz oluşturuldu (#{number})", ticketCreatedBody: "Merhaba {name},\n\n\"{subject}\" başlıklı talebiniz oluşturuldu. Destek ekibimiz en kısa sürede dönüş yapacaktır.", ticketReplySubject: "Talebinize yeni yanıt geldi (#{number})", ticketReplyBody: "Merhaba {name},\n\n{subject} başlıklı talebinize destek ekibimizin yanıtı:\n\n{reply}" }, update: {} });
    const replace = (value: string) => value.replaceAll("{name}", result.customer.name).replaceAll("{subject}", result.subject).replaceAll("{number}", String(result.number));
    queueSupportEmail(result.customer.email, replace(template.ticketCreatedSubject), `${replace(template.ticketCreatedBody)}${contact ? `\n\nBize ulaşmak için:\n${contact}` : ""}`, "Talep oluşturma", { conversationId: result.id, userId: actor.id });
  }
  return result;
}
export async function messages(
  actor: Actor,
  id: string,
  page: number,
  limit: number,
) {
  await getConversation(actor, id);
  const where = {
    conversationId: id,
    conversation: { is: visibility(actor) },
    ...(actor.role === "CUSTOMER" ? { type: {not:'INTERNAL_NOTE' as const} } : {}),
  };
  const [data, total] = await db.$transaction(
    async (tx) => {
      const data = await tx.conversationMessage.findMany({
        where,
        include: { author: { select: person },attachments:{select:{id:true,originalName:true,mimeType:true,size:true}} },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      });
      const total = await tx.conversationMessage.count({ where });
      return [data, total] as const;
    },
    { isolationLevel: "RepeatableRead" },
  );
  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
// Keep the original messages in the timeline, including records written before audit metadata existed.
export async function history(actor: Actor, id: string, page: number, limit: number) {
  if (actor.role === 'CUSTOMER') throw new AppError(403, 'FORBIDDEN', 'İşlem geçmişi personele açıktır.');
  await getConversation(actor, id);
  const entries = await db.$transaction(async tx => {
    const messages = await tx.conversationMessage.findMany({ where: { conversationId: id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: { author: { select: person }, attachments: { select: { id: true, originalName: true, mimeType: true, size: true } } } });
    const logs = await tx.activityLog.findMany({ where: { entityId: id, entityType: 'Conversation', action: { notIn: ['conversation.replied', 'conversation.note_added', 'conversation.email_received'] } }, include: { user: { select: person } } });
    const labels: Record<string, string> = { 'conversation.created': 'Talep oluşturuldu', 'conversation.updated': 'Talep bilgileri güncellendi', 'conversation.claimed': 'Temsilci talebi üzerine aldı', 'conversation.email_sent': 'E-posta sunucusu bildirimi kabul etti', 'conversation.email_failed': 'E-posta bildirimi gönderilemedi' };
    const creation = logs.find(log => log.action === 'conversation.created');
    return [
      ...messages.map((message, index) => ({ ...message, author: index === 0 && creation ? creation.user : message.author, action: index === 0 && creation ? 'INITIAL_MESSAGE' : message.type, metadata: null })),
      ...logs.map(log => ({ id: log.id, conversationId: id, type: 'SYSTEM' as const, action: log.action, body: labels[log.action] ?? log.action, createdAt: log.createdAt, author: log.user, attachments: [], metadata: log.metadata })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
  }, { isolationLevel: 'RepeatableRead' });
  return { data: entries.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: entries.length, totalPages: Math.ceil(entries.length / limit) } };
}
export async function addMessage(
  actor: Actor,
  id: string,
  input: z.infer<typeof messageSchema>,
  files:StoredUpload[] = [],
) {
  const type = input.type ?? (input.isInternalNote ? 'INTERNAL_NOTE' : actor.role === 'CUSTOMER' ? 'CUSTOMER_MESSAGE' : 'AGENT_REPLY');
  if (input.type && input.isInternalNote !== undefined && (input.type === 'INTERNAL_NOTE') !== input.isInternalNote)
    throw new AppError(400,'INVALID_MESSAGE_TYPE','Mesaj türü ve dahili not seçimi uyuşmuyor.');
  const internal = type === 'INTERNAL_NOTE';
  if ((actor.role === 'CUSTOMER' && type !== 'CUSTOMER_MESSAGE') || (actor.role !== 'CUSTOMER' && type === 'CUSTOMER_MESSAGE'))
    throw new AppError(403, "FORBIDDEN", "Dahili not ekleme yetkiniz yok.");
  const result=await db.$transaction(async (tx) => {
    // Authorized update obtains a row lock before writing a message, serializing assignment/status changes.
    const lock = await tx.conversation.updateMany({
      where: { AND: [mutationVisibility(actor), { id, status: { not: "CLOSED" } }] },
      data: { updatedAt: new Date() },
    });
    if (lock.count !== 1)
      throw new AppError(
        409,
        "TICKET_UNAVAILABLE",
        "Talep kapalı veya erişilemiyor.",
      );
    const message = await tx.conversationMessage.create({
      data: { conversationId: id, authorId: actor.id, body:input.body,type,attachments:{create:files.map(file=>({...file,uploaderId:actor.id}))} },
      include: { author: { select: person },attachments:{select:{id:true,originalName:true,mimeType:true,size:true}} },
    });
    await tx.activityLog.create({
      data: {
        userId: actor.id,
        action: internal ? "conversation.note_added" : "conversation.replied",
        entityId: id,
        metadata: { messageId: message.id, type, attachmentCount: files.length },
        ipAddress:actor.ipAddress,
      },
    });
    const conversation=await tx.conversation.findUniqueOrThrow({where:{id}});
    if(type==='AGENT_REPLY'&&!conversation.firstResponseAt)await tx.conversation.update({where:{id},data:{firstResponseAt:message.createdAt}});
    await notifyConversation(tx,actor,conversation,internal?'NOTE':'REPLY',internal?'Yeni ekip notu':'Görüşmeye yeni yanıt',internal);
    return message;
  });
  publishChange(id,internal);
  if (type === 'AGENT_REPLY') {
    const conversation = await db.conversation.findUnique({
      where: { id }, include: { customer: { select: { name: true, email: true, phone: true } } },
    });
    if (conversation?.channel !== "SMS" && conversation?.channel !== "WHATSAPP" && conversation?.customer.email) {
      const contact = await supportContact(); const template = await db.notificationSettings.upsert({ where: { id: "default" }, create: { id: "default", ticketCreatedSubject: "Talebiniz oluşturuldu (#{number})", ticketCreatedBody: "Merhaba {name},\n\n\"{subject}\" başlıklı talebiniz oluşturuldu. Destek ekibimiz en kısa sürede dönüş yapacaktır.", ticketReplySubject: "Talebinize yeni yanıt geldi (#{number})", ticketReplyBody: "Merhaba {name},\n\n{subject} başlıklı talebinize destek ekibimizin yanıtı:\n\n{reply}" }, update: {} });
      const replace = (value: string) => value.replaceAll("{name}", conversation.customer.name).replaceAll("{subject}", conversation.subject).replaceAll("{number}", String(conversation.number)).replaceAll("{reply}", result.body);
      queueSupportEmail(conversation.customer.email, replace(template.ticketReplySubject), `${replace(template.ticketReplyBody)}${contact ? `\n\nBize ulaşmak için:\n${contact}` : ""}`, "Yanıt", { conversationId: id, userId: actor.id });
    }
  }
  if (type === 'AGENT_REPLY') {
    const channelConversation = await db.conversation.findUnique({ where: { id }, include: { customer: { select: { email: true, phone: true } } } });
    if (channelConversation && (channelConversation.channel === "SMS" || channelConversation.channel === "WHATSAPP")) void sendChannelReply(channelConversation.channel, channelConversation.customer, result.body).catch(async error => {
      await db.activityLog.create({ data: { userId: actor.id, action: "conversation.channel_reply_failed", entityId: id, metadata: { channel: channelConversation.channel, reason: error instanceof Error ? error.message : String(error) } } });
    });
  }
  return result;
}
export async function updateConversation(
  actor: Actor,
  id: string,
  input: z.infer<typeof updateConversationSchema>,
) {
  if (actor.role === "CUSTOMER")
    throw new AppError(403, "FORBIDDEN", "Bu işlem için yetkiniz yok.");
  if (
    (input.assignedAgentId !== undefined || input.departmentId!==undefined) &&
    !["ADMIN", "SUPERVISOR"].includes(actor.role)
  )
    throw new AppError(
      403,
      "FORBIDDEN",
      "Atama işlemini yönetici veya departman sorumlusu yapabilir.",
    );
  const result=await db.$transaction(async (tx) => {
    const lock = await tx.conversation.updateMany({
      where: { AND: [mutationVisibility(actor), { id }] },
      data: { updatedAt: new Date() },
    });
    if (lock.count !== 1)
      throw new AppError(404, "TICKET_NOT_FOUND", "Talep bulunamadı.");
    const conversation = await tx.conversation.findUniqueOrThrow({ where: { id } });
    if (input.status && !(await tx.statusOption.findFirst({ where: { code: input.status, isActive: true } }))) throw new AppError(400, "INVALID_STATUS", "Durum seçeneği geçersiz.");
    if (input.priority && !(await tx.priorityOption.findFirst({ where: { code: input.priority, isActive: true } }))) throw new AppError(400, "INVALID_PRIORITY", "Öncelik seçeneği geçersiz.");
    if(input.departmentId&&!await tx.department.findFirst({where:{id:input.departmentId,isActive:true}}))throw new AppError(400,'INVALID_DEPARTMENT','Aktif bir departman seçin.');
    const website = input.websiteId === undefined ? undefined : input.websiteId ? await tx.website.findFirst({ where: { id: input.websiteId, isActive: true } }) : null;
    if (input.websiteId && !website) throw new AppError(400, "INVALID_WEBSITE", "Geçerli bir web sitesi seçin.");
    const targetDepartment=input.departmentId??conversation.departmentId;
    const assignedAgentId=input.assignedAgentId!==undefined?input.assignedAgentId:targetDepartment!==conversation.departmentId?null:conversation.assignedAgentId;
    if (input.assignedAgentId) {
      const agent = await tx.user.findFirst({
        where: {
          id: input.assignedAgentId,
          role: { in: ["AGENT", "SUPERVISOR"] },
          isActive:true,
          deletedAt: null,
          departments: { some: { departmentId: targetDepartment } },
        },
      });
      if (!agent)
        throw new AppError(
          400,
          "INVALID_AGENT",
          "Personel bu departmanda görevli olmalıdır.",
        );
    }
    if(input.tagIds && (new Set(input.tagIds).size!==input.tagIds.length || await tx.tag.count({where:{id:{in:input.tagIds}}})!==input.tagIds.length))throw new AppError(400,'INVALID_TAG','Etiketler geçersiz.');
    const {tagIds,...changes}=input;
    const updated = await tx.conversation.update({
      where: { id },
      data: {
        ...changes,assignedAgentId,
        ...(input.websiteId !== undefined ? { websiteId: website?.id ?? null, websiteUrl: website?.url ?? null } : {}),
        ...(tagIds?{tags:{deleteMany:{},create:tagIds.map(tagId=>({tagId}))}}:{}),
        ...(input.status
          ? { closedAt: input.status === "CLOSED" ? conversation.closedAt??new Date() : null,resolvedAt:['RESOLVED','CLOSED'].includes(input.status)?conversation.resolvedAt??new Date():null }
          : {}),
      },
      include: conversationInclude,
    });
    await tx.activityLog.create({
      data: {
        userId: actor.id,
        action: "conversation.updated",
        entityId: id,
        metadata: input,
        ipAddress:actor.ipAddress,
      },
    });
    await notifyConversation(tx,actor,updated,'UPDATED',input.departmentId?'Görüşme departmana aktarıldı':input.assignedAgentId!==undefined?'Görüşme ataması güncellendi':'Görüşme güncellendi');
    const changesText: string[]=[];
    if(updated.status!==conversation.status)changesText.push(`Durum: ${updated.status}`);
    if(updated.priority!==conversation.priority)changesText.push(`Öncelik: ${updated.priority}`);
    if(updated.departmentId!==conversation.departmentId)changesText.push(`Departman: ${updated.department.name}`);
    if(updated.assignedAgentId!==conversation.assignedAgentId)changesText.push(updated.assignedAgent ? `Atanan temsilci: ${updated.assignedAgent.name}` : 'Temsilci ataması kaldırıldı');
    if(updated.websiteId!==conversation.websiteId)changesText.push(updated.website ? `Web sitesi: ${updated.website.name}` : 'Web sitesi kaldırıldı');
    if(changesText.length)await tx.conversationMessage.create({data:{conversationId:id,authorId:actor.id,type:'SYSTEM',body:changesText.join(' · ')}});
    return updated;
  });
  publishChange(id);
  return result;
}
export async function assignToMe(actor:Actor,id:string){
  if(actor.role!=='AGENT')throw new AppError(403,'FORBIDDEN','Bu işlem destek temsilcilerine açıktır.');
  await getConversation(actor,id);
  const result=await db.$transaction(async tx=>{
    const claimed=await tx.conversation.updateMany({where:{id,deletedAt:null,assignedAgentId:null,departmentId:{in:actor.departmentIds},status:{not:'CLOSED'}},data:{assignedAgentId:actor.id}});
    if(claimed.count!==1)throw new AppError(409,'CONVERSATION_UNAVAILABLE','Görüşme başka bir temsilciye atanmış veya kapalı.');
    const conversation=await tx.conversation.findUniqueOrThrow({where:{id},include:conversationInclude});
    await tx.conversationMessage.create({data:{conversationId:id,authorId:actor.id,type:'SYSTEM',body:`Atanan temsilci: ${conversation.assignedAgent!.name}`}});
    await tx.activityLog.create({data:{userId:actor.id,action:'conversation.claimed',entityId:id,ipAddress:actor.ipAddress}});
    await notifyConversation(tx,actor,conversation,'ASSIGNED','Görüşme bir temsilciye atandı');
    return conversation;
  });
  publishChange(id);
  return result;
}
export async function deleteConversation(actor:Actor,id:string){
  if(actor.role!=='ADMIN')throw new AppError(403,'FORBIDDEN','Silme işlemi yalnızca yöneticiye açıktır.');
  await db.$transaction(async tx=>{
    const result=await tx.conversation.updateMany({where:{id,deletedAt:null},data:{deletedAt:new Date()}});
    if(!result.count)throw new AppError(404,'TICKET_NOT_FOUND','Talep bulunamadı.');
    await tx.activityLog.create({data:{userId:actor.id,action:'conversation.deleted',entityId:id,ipAddress:actor.ipAddress}});
  });
  publishChange();
}
export async function deleteConversations(actor:Actor,period:'day'|'week'|'month'|'all'){
  if(actor.role!=='ADMIN')throw new AppError(403,'FORBIDDEN','Silme işlemi yalnızca yöneticiye açıktır.');
  const days=period==='day'?1:period==='week'?7:period==='month'?30:null;
  const since=days?new Date(Date.now()-days*24*60*60*1000):undefined;
  const result=await db.$transaction(async tx=>{
    const where={deletedAt:null,...(since?{createdAt:{gte:since}}:{})};
    const targets=await tx.conversation.findMany({where,select:{id:true}});
    const deleted=await tx.conversation.updateMany({where,data:{deletedAt:new Date()}});
    if(targets.length)await tx.activityLog.createMany({data:targets.map(({id})=>({userId:actor.id,action:'conversation.deleted',entityId:id,ipAddress:actor.ipAddress}))});
    return deleted;
  });
  publishChange();
  return {deleted:result.count};
}
export async function summary(actor: Actor) {
  const grouped = await db.conversation.groupBy({
    by: ["status"],
    where: visibility(actor),
    _count: true,
  });
  const unassigned = await db.conversation.count({
    where: {
      AND: [
        visibility(actor),
        { assignedAgentId: null, status: { notIn: ["RESOLVED", "CLOSED"] } },
      ],
    },
  });
  const today=new Date();today.setHours(0,0,0,0);
  const conversationsToday=await db.conversation.count({where:{AND:[visibility(actor),{createdAt:{gte:today}}]}});
  const activeAgents=actor.role==='CUSTOMER'?undefined:await db.user.count({where:{role:'AGENT',isActive:true,...(actor.role==='ADMIN'?{}:{departments:{some:{departmentId:{in:actor.departmentIds}}}})}});
  return {
    total: grouped.reduce((a, g) => a + g._count, 0),
    unassigned,
    conversationsToday,activeAgents,
    statuses: Object.fromEntries(grouped.map((g) => [g.status, g._count])),
  };
}
