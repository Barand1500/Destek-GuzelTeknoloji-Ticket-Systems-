import type { RequestHandler } from 'express';
import { can } from '../services/permissions.js';
import { AppError } from '../utils/errors.js';

// Built-in staff roles use their saved template permissions; customers and legacy admins keep their existing checks.
export const enforceRolePermissions: RequestHandler = (req, _res, next) => {
  if (!req.actor.accessRole && !['SUPERVISOR', 'AGENT'].includes(req.actor.role)) { next(); return; }
  const path = req.path, read = req.method === 'GET';
  const allow = (key: string) => { if (!can(req.actor, key)) throw new AppError(403, 'FORBIDDEN', 'Rolünüz bu işlem için yetkili değil.'); };
  if (/^\/(auth\/me|profile|notifications|presence)(\/|$)/.test(path)) { next(); return; }
  if (path === '/role-options') { allow('users.view'); next(); return; }
  if (/^\/users\/[^/]+\/assignment-impact$/.test(path)) {
    if (!can(req.actor, 'users.update') && !can(req.actor, 'users.delete')) throw new AppError(403, 'FORBIDDEN', 'Personel atama bilgilerini görme yetkiniz yok.');
    next(); return;
  }
  if (path.startsWith('/roles')) throw new AppError(403, 'FORBIDDEN', 'Rolleri yalnızca sistem yöneticisi yönetebilir.');
  if (path.startsWith('/dashboard')) { allow('dashboard.view'); next(); return; }
  if (path.startsWith('/reports')) { allow('reports.view'); next(); return; }
  if (/^\/(conversations|attachments)(\/|$)/.test(path)) {
    allow('conversations.view');
    if (!read) {
      if (req.method === 'DELETE') allow('conversations.delete');
      else if (path.endsWith('/messages')) { /* Multipart body is checked by addMessage after upload parsing. */ }
      else if (path.endsWith('/assign-to-me')) allow('conversations.assign');
      else if (req.method === 'POST') allow('conversations.create');
      else {
        for (const key of Object.keys(req.body ?? {})) allow(key === 'assignedAgentId' ? 'conversations.assign' : key === 'departmentId' ? 'conversations.transfer' : 'conversations.update');
      }
    } else if (path.endsWith('/history')) allow('conversations.history');
    next(); return;
  }
  // Read-only directories also feed permitted forms and selectors.
  const dependencies: Record<string, string[]> = {
    departments: ['departments.view', 'conversations.view', 'conversations.create', 'users.view', 'announcements.view', 'surveys.view'],
    agents: ['conversations.view', 'conversations.create'],
    tags: ['tags.view', 'conversations.view', 'conversations.create'],
    'status-options': ['tags.view', 'conversations.view'],
    'priority-options': ['tags.view', 'conversations.view', 'conversations.create'],
    websites: ['websites.view', 'guide.view', 'conversations.view', 'conversations.create'],
    'staff-presence': ['presence.view', 'conversations.view'],
    customers: ['customers.view', 'conversations.create'],
    'saved-replies': ['savedReplies.view', 'conversations.reply'],
  };
  const segment = path.split('/')[1];
  if (/^\/departments\/[^/]+\/agents$/.test(path)) { allow('conversations.assign'); next(); return; }
  if (path === '/surveys/directory') { allow('surveys.create'); next(); return; }
  if (/^\/surveys\/[^/]+\/responses$/.test(path)) { allow('surveys.view'); next(); return; }
  if (path === '/announcements/directory' || (read && path.startsWith('/announcement-templates'))) { allow('announcements.create'); next(); return; }
  if (path === '/staff-suggestions') { allow('conversations.assign'); next(); return; }
  if (read && dependencies[segment] && !path.includes('/guide-files')) {
    if (!dependencies[segment].some(key => can(req.actor, key))) allow(`${segment}.view`);
    next(); return;
  }
  let resource: string | undefined = ({ users: 'users', customers: 'customers', departments: 'departments', tags: 'tags', 'status-options': 'tags', 'priority-options': 'tags', websites: 'websites', 'saved-replies': 'savedReplies', 'activity-logs': 'logs', 'staff-presence': 'response', integrations: 'integrations', 'notification-settings': 'integrations', 'response-time-settings': 'response', surveys: 'surveys', announcements: 'announcements', 'announcement-templates': 'announcements', 'staff-suggestions': 'conversations' } as Record<string,string>)[segment];
  if (path.includes('/guide-files')) resource = 'guide';
  if (!resource) throw new AppError(403, 'FORBIDDEN', 'Bu işlem rolünüze açık değil.');
  const action = read ? 'view' : req.method === 'DELETE' ? 'delete' : path.endsWith('/test') ? 'test' : path.endsWith('/responses') ? 'view' : path.endsWith('/close') ? 'update' : req.method === 'POST' ? 'create' : 'update';
  allow(`${resource}.${action}`);
  if (read && path.endsWith('/statistics')) allow('surveys.statistics');
  next();
};
