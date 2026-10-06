import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/db.js';
import { AppError } from '../utils/errors.js';
import { permissionGroups, permissionKeys, templatePermissions } from '../services/permissions.js';
import { publishChange } from '../services/events.service.js';
const schema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).default(''),
  scope: z.enum(['OWN', 'DEPARTMENT', 'ALL']),
  permissions: z.array(z.string().refine(p => permissionKeys.includes(p))).max(permissionKeys.length)
    .refine(p => new Set(p).size === p.length)
    .refine(p => p.every(key => key.endsWith('.view') || p.includes(`${key.split('.')[0]}.view`)), 'İşlem yetkisi için ekran erişimi gereklidir.'),
}).strict();
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
  res.json({ success: true, data, groups: permissionGroups, templates: ['ADMIN', 'SUPERVISOR', 'AGENT'].map(id => ({ id, permissions: templatePermissions(id), scope: id === 'ADMIN' ? 'ALL' : 'DEPARTMENT' })) });
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
