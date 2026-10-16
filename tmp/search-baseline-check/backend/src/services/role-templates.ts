import { db } from '../config/db.js';
import { permissionKeys, templatePermissions } from './permissions.js';

type BuiltInStaffRole = 'SUPERVISOR' | 'AGENT';
type RuntimeTemplate = { permissions: string[]; scope: 'OWN' | 'DEPARTMENT' | 'ALL' };
type StoredTemplate = { permissions?: unknown; scope?: unknown };

let cachedTemplates: Record<string, StoredTemplate> | undefined;
let cachedAt = 0;

async function templates() {
  if (cachedTemplates && Date.now() - cachedAt < 5000) return cachedTemplates;
  const setting = await db.systemSettings.findUnique({ where: { id: 'default' }, select: { roleTemplates: true } });
  const raw = setting?.roleTemplates;
  cachedTemplates = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, StoredTemplate> : {};
  cachedAt = Date.now();
  return cachedTemplates;
}

export async function builtInStaffTemplate(role: BuiltInStaffRole): Promise<RuntimeTemplate> {
  const template = (await templates())[role];
  const permissions = Array.isArray(template?.permissions)
    ? template.permissions.filter((item): item is string => typeof item === 'string' && permissionKeys.includes(item as never))
    : templatePermissions(role);
  const scope = template?.scope === 'OWN' || template?.scope === 'ALL' || template?.scope === 'DEPARTMENT'
    ? template.scope
    : 'DEPARTMENT';
  return { permissions, scope };
}

export function invalidateBuiltInStaffTemplates() {
  cachedAt = 0;
}
