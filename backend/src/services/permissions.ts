export const permissionGroups = [
  { id: 'dashboard', name: 'Genel bakış', actions: { view: 'Görüntüleme' } },
  { id: 'conversations', name: 'Gelen kutusu ve talepler', actions: { view: 'Görüntüleme', create: 'Talep oluşturma', reply: 'Yanıt yazma', note: 'Dahili not ekleme', assign: 'Atama ve üzerine alma', transfer: 'Departmana aktarma', update: 'Durum, öncelik ve proje değiştirme', history: 'Konuşma geçmişi', delete: 'Silme' } },
  { id: 'customers', name: 'Müşteriler', actions: { view: 'Görüntüleme', create: 'Ekleme', update: 'Düzenleme', delete: 'Silme' } },
  { id: 'files', name: 'Dosyalar', actions: { view: 'Görüntüleme ve indirme', create: 'Yükleme ve klasör oluşturma', update: 'Kendi dosyasını düzenleme', updateAll: 'Herkesin dosyasını düzenleme', delete: 'Kendi dosyasını silme', deleteAll: 'Herkesin dosyasını silme' } },
  { id: 'reports', name: 'Raporlar', actions: { view: 'Görüntüleme', export: 'Dışa aktarma' } },
  { id: 'users', name: 'Personeller', actions: { view: 'Görüntüleme', create: 'Ekleme', update: 'Düzenleme', delete: 'Silme' } },
  { id: 'departments', name: 'Departmanlar', actions: { view: 'Görüntüleme', create: 'Ekleme', update: 'Düzenleme', delete: 'Silme' } },
  { id: 'integrations', name: 'Entegrasyonlar', actions: { view: 'Görüntüleme', update: 'Ayarları değiştirme', test: 'Bağlantı testi' } },
  { id: 'response', name: 'Yanıt süreleri', actions: { view: 'Görüntüleme', update: 'Ayarları değiştirme' } },
  { id: 'presence', name: 'Personel aktivitesi', actions: { view: 'Görüntüleme' } },
  { id: 'tags', name: 'Kategoriler ve durumlar', actions: { view: 'Görüntüleme', create: 'Ekleme', update: 'Düzenleme', delete: 'Silme' } },
  { id: 'websites', name: 'Projeler', actions: { view: 'Görüntüleme', create: 'Ekleme', update: 'Düzenleme', delete: 'Silme' } },
  { id: 'guide', name: 'Rehber', actions: { view: 'Görüntüleme', create: 'Dosya ekleme', delete: 'Dosya silme' } },
  { id: 'surveys', name: 'Anketler', actions: { view: 'Görüntüleme ve yanıtlama', create: 'Oluşturma', update: 'Kapatma', statistics: 'İstatistikler', delete: 'Silme' } },
  { id: 'announcements', name: 'Duyurular ve takvim', actions: { view: 'Görüntüleme', create: 'Duyuru oluşturma', delete: 'Silme' } },
  { id: 'savedReplies', name: 'Hazır yanıtlar', actions: { view: 'Görüntüleme', create: 'Ekleme', update: 'Düzenleme', delete: 'Silme' } },
  { id: 'logs', name: 'İşlem geçmişi', actions: { view: 'Görüntüleme', delete: 'Silme' } },
] as const;
export const permissionKeys = permissionGroups.flatMap(g => Object.keys(g.actions).map(a => `${g.id}.${a}`));
export type PermissionActor = { role: string; rolePermissions?: string[]; roleScope?: string; accessRole?: { permissions: unknown; scope: string } | null };
export function permissionScope(actor: PermissionActor) {
  return actor.accessRole?.scope ?? actor.roleScope ?? (actor.role === 'ADMIN' ? 'ALL' : 'DEPARTMENT');
}
export function can(actor: PermissionActor, permission: string) {
  if (!actor.accessRole) return actor.role === 'ADMIN' || Boolean(actor.rolePermissions?.includes(permission));
  const permissions = actor.accessRole.permissions;
  return Array.isArray(permissions) && permissions.includes(permission);
}
export function templatePermissions(role: string) {
  if (role === 'ADMIN') return permissionKeys;
  const common = ['dashboard.view', 'conversations.view', 'conversations.create', 'conversations.reply', 'conversations.note', 'conversations.history', 'conversations.update', 'conversations.assign', 'customers.view', 'customers.create', 'customers.update', 'files.view', 'files.create', 'files.update', 'files.delete', 'guide.view', 'websites.view', 'tags.view', 'departments.view', 'surveys.view', 'announcements.view', 'savedReplies.view', 'savedReplies.create', 'savedReplies.update', 'savedReplies.delete'];
  return role === 'SUPERVISOR' ? [...common, 'conversations.transfer', 'presence.view', 'announcements.create'] : common;
}
