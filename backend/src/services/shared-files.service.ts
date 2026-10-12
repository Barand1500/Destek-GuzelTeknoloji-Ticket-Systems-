import { db } from '../config/db.js';
import { can } from './permissions.js';
import { events } from './events.service.js';
import { discardStoredUploads, type StoredUpload } from './uploads.service.js';
import { AppError } from '../utils/errors.js';
import type { Actor } from '../types/express.js';
import type { Prisma } from '../generated/prisma/client.js';

function requirePermission(actor: Actor, permission: string) {
  if (actor.role === 'CUSTOMER' || !can(actor, permission)) throw new AppError(403, 'FORBIDDEN', 'Bu dosya işlemi için yetkiniz yok.');
}
function ownsPermission(actor: Actor, item: { uploaderId: string }, action: 'update' | 'delete') {
  if (actor.role === 'CUSTOMER' || !(can(actor, `files.${action}All`) || (item.uploaderId === actor.id && can(actor, `files.${action}`)))) throw new AppError(403, 'FORBIDDEN', 'Bu dosya veya klasör için yetkiniz yok.');
}
async function parentFolder(tx: Prisma.TransactionClient, parent: string | null) {
  if (parent && !await tx.sharedFile.findFirst({ where: { id: parent, type: 'folder' } })) throw new AppError(404, 'NOT_FOUND', 'Klasör bulunamadı.');
}
const select = { id: true, name: true, type: true, parent: true, size: true, createdAt: true, icon: true, color: true, uploaderId: true, uploadedBy: true };
export async function sharedFiles(actor: Actor) {
  requirePermission(actor, 'files.view');
  return db.sharedFile.findMany({ select, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
}
export async function createSharedFolder(actor: Actor, data: { name: string; parent: string | null; icon: string; color: string }) {
  requirePermission(actor, 'files.create');
  const result = await db.$transaction(async tx => {
    await parentFolder(tx, data.parent);
    return tx.sharedFile.create({ data: { ...data, type: 'folder', uploaderId: actor.id, uploadedBy: actor.name }, select });
  });
  events.emit('files:changed');
  return result;
}
export async function uploadSharedFiles(actor: Actor, parent: string | null, files: StoredUpload[]) {
  requirePermission(actor, 'files.create');
  const result = await db.$transaction(async tx => {
    await parentFolder(tx, parent);
    const items = [];
    for (const file of files) items.push(await tx.sharedFile.create({ data: { name: file.originalName, type: 'file', parent, size: file.size, mimeType: file.mimeType, storageKey: file.storageKey, icon: 'file', color: 'blue', uploaderId: actor.id, uploadedBy: actor.name }, select }));
    return items;
  });
  events.emit('files:changed');
  return result;
}
export async function updateSharedFile(actor: Actor, id: string, data: { name: string; icon: string; color: string }) {
  const result = await db.$transaction(async tx => {
    const item = await tx.sharedFile.findUnique({ where: { id } });
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Dosya bulunamadı.');
    ownsPermission(actor, item, 'update');
    return tx.sharedFile.update({ where: { id }, data, select });
  });
  events.emit('files:changed');
  return result;
}
export async function deleteSharedFile(actor: Actor, id: string) {
  const files = await db.$transaction(async tx => {
    const all = await tx.sharedFile.findMany();
    const target = all.find(item => item.id === id);
    if (!target) throw new AppError(404, 'NOT_FOUND', 'Dosya bulunamadı.');
    const selected = [target];
    for (let i = 0; i < selected.length; i++) selected.push(...all.filter(item => item.parent === selected[i].id));
    for (const item of selected) ownsPermission(actor, item, 'delete');
    // Children must be deleted before their parent to preserve folder integrity.
    for (const item of [...selected].reverse()) await tx.sharedFile.delete({ where: { id: item.id } });
    return selected.filter(item => item.storageKey).map(item => ({ storageKey: item.storageKey!, originalName: item.name, size: item.size!, mimeType: item.mimeType! }));
  }, { isolationLevel: 'Serializable' });
  await discardStoredUploads(files);
  events.emit('files:changed');
}
export async function sharedFileDownload(actor: Actor, id: string) {
  requirePermission(actor, 'files.view');
  const item = await db.sharedFile.findUnique({ where: { id } });
  if (!item || item.type !== 'file' || !item.storageKey) throw new AppError(404, 'NOT_FOUND', 'Dosya bulunamadı.');
  return item;
}
