import type { User } from '../../types';
export function hasPermission(user: User | null, key: string) {
  if (!user) return false;
  if (!user.accessRole) return user.role === 'ADMIN' || user.role === 'CUSTOMER' || Boolean(user.rolePermissions?.includes(key));
  return user.accessRole.permissions.includes(key);
}
export function screenPermission(path: string): string | null {
  const suffix = path.replace(/^\/(admin|agent|customer)\/?/, '').split('/');
  const mapping: Record<string,string> = { dashboard: 'dashboard', conversations: 'conversations', inbox: 'conversations', tickets: 'conversations', 'phone-support': 'conversations', customers: 'customers', users: 'users', departments: 'departments', files: 'files', reports: 'reports', roles: 'roles', integrations: 'integrations', settings: 'integrations', 'response-time-rules': 'response', 'staff-presence': 'presence', tags: 'tags', websites: 'websites', guide: 'guide', 'project-guide': 'guide', surveys: 'surveys', calendar: 'announcements', 'saved-replies': 'savedReplies', 'activity-logs': 'logs' };
  if (suffix[0] === 'roles') return 'roles.view';
  if (suffix[0] === 'notification-settings') return 'integrations.view';
  if (suffix[suffix.length - 1] === 'log') return 'conversations.history';
  const resource = mapping[suffix[0]];
  if (!resource) return null;
  if (suffix[0] === 'phone-support' || (suffix[0] === 'tickets' && suffix[1] === 'new')) return 'conversations.create';
  if (suffix[0] === 'integrations' && suffix[1] === 'response-times') return 'response.view';
  return `${resource}.view`;
}
export function permissionHome(user: User) {
  if (!user.accessRole) return null;
  const pages = ['dashboard', 'conversations', 'customers', 'reports', 'files', 'users', 'departments', 'staff-presence', 'guide/projects', 'surveys', 'integrations/channels', 'response-time-rules', 'tags', 'websites', 'saved-replies', 'activity-logs', 'calendar'];
  return pages.map(page => `${user.role === 'ADMIN' ? '/admin' : user.role === 'CUSTOMER' ? '/customer' : '/agent'}/${page}`).find(path => hasPermission(user, screenPermission(path)!)) ?? `${user.role === 'ADMIN' ? '/admin' : user.role === 'CUSTOMER' ? '/customer' : '/agent'}/profile`;
}
