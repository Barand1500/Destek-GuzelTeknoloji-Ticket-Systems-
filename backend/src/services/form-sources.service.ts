import { z } from 'zod';
import { db } from '../config/db.js';
import { can } from './permissions.js';
import { AppError } from '../utils/errors.js';
import type { Actor } from '../types/express.js';
export const formSourceSchema = z.object({
 name: z.string().trim().min(1).max(100),
 url: z.string().trim().url().max(500).refine(value => {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
 }, 'Geçerli bir http veya https site adresi girin.'),
}).strict();
export const listFormSources = () => db.formSource.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
function requireEdit(actor: Actor) {
 if (!can(actor, 'integrations.update')) throw new AppError(403, 'FORBIDDEN', 'Form kaynaklarını değiştirme yetkiniz yok.');
}
export async function createFormSource(actor: Actor, input: z.infer<typeof formSourceSchema>) {
 requireEdit(actor);
 return db.$transaction(async tx => {
  const source = await tx.formSource.create({ data: { name: input.name, url: new URL(input.url).origin } });
  await tx.activityLog.create({ data: { userId: actor.id, action: 'integrations.updated', entityType: 'FormSource', entityId: source.id, metadata: { channel: 'FORM', name: source.name, url: source.url }, ipAddress: actor.ipAddress } });
  return source;
 });
}
export async function setFormSourceEnabled(actor: Actor, id: string, enabled: boolean) {
 requireEdit(actor);
 return db.$transaction(async tx => {
  if (!await tx.formSource.findUnique({ where: { id } })) throw new AppError(404, 'NOT_FOUND', 'Kaynak site bulunamadı.');
  const source = await tx.formSource.update({ where: { id }, data: { enabled } });
  await tx.activityLog.create({ data: { userId: actor.id, action: 'integrations.updated', entityType: 'FormSource', entityId: id, metadata: { channel: 'FORM', enabled }, ipAddress: actor.ipAddress } });
  return source;
 });
}
export async function deleteFormSource(actor: Actor, id: string) {
 requireEdit(actor);
 return db.$transaction(async tx => {
  const source = await tx.formSource.findUnique({ where: { id } });
  if (!source) throw new AppError(404, 'NOT_FOUND', 'Kaynak site bulunamadı.');
  await tx.formSource.delete({ where: { id } });
  await tx.activityLog.create({ data: { userId: actor.id, action: 'integrations.updated', entityType: 'FormSource', entityId: id, metadata: { channel: 'FORM', deleted: true, name: source.name, url: source.url }, ipAddress: actor.ipAddress } });
 });
}
