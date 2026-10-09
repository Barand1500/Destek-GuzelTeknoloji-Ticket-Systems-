import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/db.js';
import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../utils/errors.js';
import { permissionGroups, permissionKeys, templatePermissions } from '../services/permissions.js';
import { publishChange } from '../services/events.service.js';
import { invalidateBuiltInStaffTemplates } from '../services/role-templates.js';
const schema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).default(''),
  scope: z.enum(['OWN', 'DEPARTMENT', 'ALL']),
  permissions: z.array(z.string().refine(p => permissionKeys.includes(p))).max(permissionKeys.length)
    .refine(p => new Set(p).size === p.length)
    .refine(p => p.every(key => key.endsWith('.view') || p.includes(`${key.split('.')[0]}.view`)), 'İşlem yetkisi için ekran erişimi gereklidir.'),
}).strict();
const templateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500),
  scope: z.enum(['OWN', 'DEPARTMENT', 'ALL']),
  permissions: z.array(z.string().refine(p => permissionKeys.includes(p))).max(permissionKeys.length)
    .refine(p => new Set(p).size === p.length)
    .refine(p => p.every(key => key.endsWith('.view') || p.includes(`${key.split('.')[0]}.view`))),
}).strict();
const templateIds = ['ADMIN', 'SUPERVISOR', 'AGENT'] as const;
const templateDetails: Record<(typeof templateIds)[number], { name: string; description: string }> = {
  ADMIN: { name: 'Sistem yöneticisi', description: 'Tüm ekran ve işlemlere erişim sağlayan korunan sistem rolü.' },
  SUPERVISOR: { name: 'Departman sorumlusu', description: 'Departman taleplerini ve ekibin iş akışını yöneten başlangıç rolü.' },
  AGENT: { name: 'Destek uzmanı', description: 'Talepleri takip eden ve müşterilere yanıt veren başlangıç rolü.' },
};
export const rolesRouter = Router();
rolesRouter.get('/role-options', async (req, res) => {
  if (req.actor.role === 'CUSTOMER') throw new AppError(403, 'FORBIDDEN', 'Yetkiniz yok.');
  res.json({ success: true, data: await db.accessRole.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }) });
});
rolesRouter.use('/roles', (req, _res, next) => {
  if (req.actor.role !== 'ADMIN' || req.actor.accessRole) throw new AppError(403, 'FORBIDDEN', 'Rolleri yalnızca sistem yöneticisi yönetebilir.');
  next();
});
rolesRouter.get('/roles', async (_req, res) => {
  const data = await db.accessRole.findMany({ include: { users: { where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }, _count: { select: { users: { where: { deletedAt: null } } } } }, orderBy: { name: 'asc' } });
  const savedTemplates = (await db.systemSettings.findUnique({ where: { id: 'default' }, select: { roleTemplates: true } }))?.roleTemplates;
  const saved = savedTemplates && typeof savedTemplates === 'object' && !Array.isArray(savedTemplates) ? savedTemplates as Record<string, { name?: unknown; description?: unknown; permissions?: unknown; scope?: unknown }> : {};
  const templates = templateIds.map(id => {
    const item = saved[id];
    const permissions = Array.isArray(item?.permissions) ? item.permissions.filter((key): key is string => typeof key === 'string' && permissionKeys.includes(key)) : templatePermissions(id);
    const scope = ['OWN', 'DEPARTMENT', 'ALL'].includes(String(item?.scope)) ? item!.scope as string : id === 'ADMIN' ? 'ALL' : 'DEPARTMENT';
    return { id, name: typeof item?.name === 'string' ? item.name : templateDetails[id].name, description: typeof item?.description === 'string' ? item.description : templateDetails[id].description, permissions, scope };
  });
  res.json({ success: true, data, groups: permissionGroups, templates });
});
rolesRouter.put('/roles/templates/:templateId', async (req, res) => {
  const templateId = z.enum(templateIds).parse(req.params.templateId);
  const input = templateSchema.parse(req.body);
  const settings = await db.systemSettings.findUnique({ where: { id: 'default' }, select: { roleTemplates: true } });
  const current = settings?.roleTemplates && typeof settings.roleTemplates === 'object' && !Array.isArray(settings.roleTemplates) ? settings.roleTemplates as Record<string, unknown> : {};
  const roleTemplates = { ...current, [templateId]: input } as Prisma.InputJsonObject;
  await db.systemSettings.upsert({ where: { id: 'default' }, create: { id: 'default', roleTemplates }, update: { roleTemplates } });
  invalidateBuiltInStaffTemplates();
  await db.activityLog.create({ data: { userId: req.actor.id, action: 'role.template_updated', entityType: 'RoleTemplate', entityId: templateId, metadata: { templateId, name: input.name, description: input.description, scope: input.scope, permissions: input.permissions } } });
  publishChange();
  res.json({ success: true, data: { id: templateId, ...input } });
});
rolesRouter.post('/roles', async (req, res) => {
  const input = schema.parse(req.body);
  const data = await db.$transaction(async tx => {
    const role = await tx.accessRole.create({ data: input });
    await tx.activityLog.create({ data: { userId: req.actor.id, action: 'role.created', entityType: 'AccessRole', entityId: role.id, metadata: input } });
    return role;
  });
  publishChange(); res.status(201).json({ success: true, data });
});
rolesRouter.patch('/roles/:id', async (req, res) => {
  const id = z.uuid().parse(req.params.id), input = schema.parse(req.body);
  const data = await db.$transaction(async tx => {
    if (!await tx.accessRole.findUnique({ where: { id } })) throw new AppError(404, 'NOT_FOUND', 'Rol bulunamadı.');
    const role = await tx.accessRole.update({ where: { id }, data: input });
    await tx.activityLog.create({ data: { userId: req.actor.id, action: 'role.updated', entityType: 'AccessRole', entityId: id, metadata: input } });
    return role;
  });
  publishChange(); res.json({ success: true, data });
});
rolesRouter.delete('/roles/:id', async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await db.$transaction(async tx => {
    if (await tx.user.count({ where: { accessRoleId: id, deletedAt: null } })) throw new AppError(409, 'ROLE_IN_USE', 'Önce bu role bağlı personellere başka bir rol atayın.');
    await tx.user.updateMany({ where: { accessRoleId: id }, data: { accessRoleId: null } });
    await tx.accessRole.delete({ where: { id } });
    await tx.activityLog.create({ data: { userId: req.actor.id, action: 'role.deleted', entityType: 'AccessRole', entityId: id } });
  }, { isolationLevel: 'Serializable' });
  publishChange(); res.json({ success: true, data: null });
});
