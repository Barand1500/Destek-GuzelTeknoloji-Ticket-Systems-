import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight, Building2, Check, ChevronRight, Copy, Headphones, Info, LockKeyhole, Pencil, Plus, Save, Shield, ShieldCheck, Trash2, Users } from 'lucide-react';
import { api } from '../../services/api';
import { Heading, ErrorMessage } from './shared';
import { DropdownSelect } from '../../components/DropdownSelect';
import { DeleteModal } from '../../components/DeleteModal';
import './roles.css';

type Group = { id: string; name: string; actions: Record<string, string> };
type RoleDefinition = { id: string; name: string; description: string; permissions: string[]; scope: string; users?: { id: string; name: string }[]; _count?: { users: number } };
type Catalog = { data: RoleDefinition[]; groups: Group[]; templates: { id: string; name: string; description: string; permissions: string[]; scope: string }[] };
const labels: Record<string,string> = { ADMIN: 'Sistem yöneticisi', SUPERVISOR: 'Departman sorumlusu', AGENT: 'Destek uzmanı' };
const empty = (): RoleDefinition => ({ id: '', name: '', description: '', permissions: [], scope: 'DEPARTMENT' });
const scopeLabels: Record<string, string> = { OWN: 'Kendisine atanan', DEPARTMENT: 'Bağlı departmanlar', ALL: 'Tüm departmanlar' };
const hints: Record<string, string> = { view: 'Bu ekranı menüde görür ve içeriğine erişir.', create: 'Yeni kayıt oluşturabilir.', update: 'Mevcut kayıtları düzenleyebilir.', delete: 'Kayıtları silebilir.', reply: 'Müşteriye mesaj ve dosya gönderebilir.', note: 'Ekibe özel dahili not ekleyebilir.', assign: 'Talepleri personele atayabilir veya üzerine alabilir.', transfer: 'Talepleri başka bir departmana aktarabilir.', history: 'Konuşmanın işlem geçmişini görebilir.', export: 'Rapor verilerini dışa aktarabilir.', test: 'Entegrasyon bağlantısını test edebilir.', statistics: 'Anket sonuçlarını ve istatistiklerini görebilir.' };
const specificHints: Record<string, string> = { 'conversations.create': 'Yeni bir müşteri talebi açabilir.', 'conversations.update': 'Talebin durumunu, önceliğini ve projesini değiştirebilir.', 'files.view': 'Dosyaları görüntüleyebilir ve indirebilir.', 'files.create': 'Dosya yükleyebilir ve klasör oluşturabilir.', 'files.update': 'Yalnızca kendi yüklediği dosyaları düzenleyebilir.', 'files.updateAll': 'Diğer personellerin dosyalarını da düzenleyebilir.', 'files.delete': 'Yalnızca kendi yüklediği dosyaları silebilir.', 'files.deleteAll': 'Diğer personellerin dosyalarını da silebilir.', 'surveys.view': 'Anketleri görüntüleyebilir ve yanıtlayabilir.', 'surveys.update': 'Anketleri yanıtlara kapatabilir.' };

export function RolesPage() {
  const client = useQueryClient();
  const catalog = useQuery({ queryKey: ['/roles'], queryFn: async () => (await api.get<Catalog>('/roles')).data });
  const [draft, setDraft] = useState<RoleDefinition | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState('conversations');
  const [deleteTarget, setDeleteTarget] = useState<RoleDefinition | null>(null);
  const invalidate = () => { void client.invalidateQueries({ queryKey: ['/roles'] }); void client.invalidateQueries({ queryKey: ['/role-options'] }); };
  const save = useMutation({
    mutationFn: async (role: RoleDefinition) => {
      const data = { name: role.name, description: role.description, permissions: role.permissions, scope: role.scope };
      if (editingTemplateId) return api.put(`/roles/templates/${editingTemplateId}`, { name: role.name, description: role.description, permissions: role.permissions, scope: role.scope });
      return role.id ? api.patch(`/roles/${role.id}`, data) : api.post('/roles', data);
    },
    onSuccess: () => { invalidate(); setDraft(null); setEditingTemplateId(null); },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/roles/${id}`), onSuccess: () => { invalidate(); setDeleteTarget(null); } });
  const groups = catalog.data?.groups ?? [];
  const group = groups.find(item => item.id === groupId);
  const selectedScreens = draft?.permissions.filter(key => key.endsWith('.view')).length ?? 0;
  const selectedActions = draft?.permissions.filter(key => !key.endsWith('.view')).length ?? 0;
  const groupKeys = group ? Object.keys(group.actions).map(action => `${group.id}.${action}`) : [];
  const allSelected = groupKeys.length > 0 && groupKeys.every(key => draft?.permissions.includes(key));
  const openEditor = (role: RoleDefinition) => { save.reset(); setEditingTemplateId(null); setGroupId('conversations'); setDraft({ ...role, permissions: [...role.permissions] }); window.scrollTo({ top: 0, behavior: 'instant' }); };
  const toggle = (key: string, enabled: boolean) => {
    if (!draft) return;
    const resource = key.split('.')[0];
    const selected = new Set(draft.permissions);
    if (enabled) { selected.add(key); selected.add(`${resource}.view`); }
    else if (key.endsWith('.view')) { for (const value of selected) if (value.startsWith(`${resource}.`)) selected.delete(value); }
    else selected.delete(key);
    setDraft({ ...draft, permissions: [...selected] });
  };
  const start = (templateId?: string) => {
    const template = catalog.data?.templates.find(item => item.id === templateId);
    openEditor({ ...empty(), permissions: template?.permissions ?? [], scope: template?.scope ?? 'DEPARTMENT' });
  };
  const editTemplate = (template: Catalog['templates'][number]) => {
    save.reset(); setEditingTemplateId(template.id); setGroupId('conversations');
    setDraft({ ...empty(), name: template.name, description: template.description, permissions: [...template.permissions], scope: template.scope });
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  return <main className="page roles-page">
    {draft && <button className="roles-back" type="button" disabled={save.isPending} onClick={() => { setDraft(null); setEditingTemplateId(null); }}><ArrowLeft size={15}/>Rollere dön</button>}
    <Heading title={draft ? (editingTemplateId ? `${labels[editingTemplateId]} şablonunu düzenle` : draft.id ? 'Rolü düzenle' : 'Yeni rol oluştur') : 'Roller'} description={draft ? editingTemplateId ? 'Şablon izinlerini kaydedin. Bu değişiklik bundan sonra şablondan oluşturulan rollerde kullanılır.' : 'Rolün hangi ekranlara erişeceğini ve hangi işlemleri yapabileceğini belirleyin.' : 'Ekibinizin erişimlerini tek yerden yönetin. Her role ihtiyacı olan yetkileri verin.'}>
      {!draft && <button className="button primary" disabled={!catalog.data} onClick={() => start()}><Plus size={16}/>Rol oluştur</button>}
    </Heading>
    <ErrorMessage error={catalog.error}/>
    {catalog.isPending && <p className="muted">Roller yükleniyor…</p>}
    {!draft && <>
    <section className="roles-templates" aria-label="Başlangıç rolleri">
      {catalog.data?.templates.map(template => {
        const Icon = template.id === 'ADMIN' ? ShieldCheck : template.id === 'SUPERVISOR' ? Building2 : Headphones;
        return <article className="roles-template" key={template.id}>
        <div className="roles-template-top"><span className="roles-icon-tile"><Icon size={21}/></span><span className="roles-badge">{template.id === 'ADMIN' ? <><LockKeyhole size={11}/>Korunan rol</> : 'Başlangıç şablonu'}</span></div><h3>{template.name}</h3>
        <p>{template.description}</p>
        <div className="roles-template-actions"><button className="roles-template-action" onClick={() => start(template.id)}><Copy size={14}/>Şablondan oluştur<ArrowUpRight size={15}/></button><button className="icon-button" type="button" title={`${labels[template.id]} şablonunu düzenle`} aria-label={`${labels[template.id]} şablonunu düzenle`} onClick={() => editTemplate(template)}><Pencil size={15}/></button></div>
      </article>; })}
    </section>
    <section className="roles-list" aria-label="Özel roller">
      <div className="roles-list-heading"><div><h2>Özel roller <span className="roles-count">{catalog.data?.data.length ?? 0}</span></h2><p>Oluşturduğunuz rolleri personellere atayabilirsiniz.</p></div><Shield size={20}/></div>
      {!catalog.isPending && !catalog.data?.data.length ? <div className="roles-empty"><span className="roles-icon-tile"><Shield size={24}/></span><h3>Ekibinize uygun ilk rolü oluşturun</h3><p>Bir şablondan başlayın veya izinleri kendiniz seçin.</p><button className="button secondary" disabled={!catalog.data} onClick={() => start()}><Plus size={15}/>Rol oluştur</button></div> : <div className="roles-table-wrap"><table className="roles-table"><thead><tr><th>Rol</th><th>Talep kapsamı</th><th>Erişim</th><th>Personel</th><th><span className="roles-sr-only">İşlemler</span></th></tr></thead><tbody>
      {catalog.data?.data.map(role => <tr key={role.id}>
        <td><div className="roles-name-cell"><span className="roles-row-icon"><Shield size={17}/></span><div><strong>{role.name}</strong><p>{role.description || 'Özel personel rolü'}</p></div></div></td>
        <td><span className="roles-badge">{scopeLabels[role.scope]}</span></td>
        <td><span>{role.permissions.filter(p => p.endsWith('.view')).length} ekran</span><small>{role.permissions.filter(p => !p.endsWith('.view')).length} işlem izni</small></td>
        <td><span className="roles-person-count" tabIndex={0} title={role.users?.length ? role.users.map(person => person.name).join('\n') : 'Bu role bağlı personel yok.'} aria-label={`${role._count?.users ?? 0} personel: ${role.users?.map(person => person.name).join(', ') || 'Bu role bağlı personel yok.'}`}><Users size={14}/>{role._count?.users ?? 0}</span></td>
        <td><div className="roles-row-actions"><button className="button secondary" onClick={() => openEditor(role)}><Pencil size={13}/>Düzenle</button>
        <button className="icon-button" title="Rolü kopyala" onClick={() => openEditor({ ...role, id: '', name: `${role.name} kopyası` })} aria-label={`${role.name} kopyala`}><Copy size={15}/></button>
        <button className="icon-button danger-icon" title="Rolü sil" onClick={() => { remove.reset(); setDeleteTarget(role); }} aria-label={`${role.name} sil`}><Trash2 size={15}/></button></div></td>
      </tr>)}
      </tbody></table></div>}
    </section></>}
    {draft && <form className="roles-editor" onSubmit={(event: FormEvent) => { event.preventDefault(); save.mutate(draft); }}>
      <fieldset className="roles-editor-fields" disabled={save.isPending}>
      <section className="roles-details"><div className="roles-panel-heading"><span className="roles-row-icon"><Shield size={18}/></span><div><h2>Rol bilgileri</h2><p>Personel seçiminde görünecek ad ve talep kapsamı.</p></div></div>
      <div className="roles-basics">
        <label><span className="field-label">{editingTemplateId ? 'Şablon adı' : 'Rol adı'}</span><input autoFocus value={draft.name} placeholder="Örn. Kıdemli destek" onChange={e => setDraft({ ...draft, name: e.target.value })} required minLength={2} maxLength={80}/></label>
        <label><span className="field-label">Açıklama</span><input value={draft.description} placeholder="Bu rolün sorumluluğu" onChange={e => setDraft({ ...draft, description: e.target.value })} maxLength={500}/></label>
        <DropdownSelect label="Talep kapsamı" ariaLabel="Talep kapsamı" value={draft.scope} onChange={scope => setDraft({ ...draft, scope })} options={[{ value: 'OWN', label: 'Kendisine atanan talepler' }, { value: 'DEPARTMENT', label: 'Bağlı olduğu departmanlar' }, { value: 'ALL', label: 'Tüm departmanlar' }]}/>
      </div></section>
      <section className="roles-permissions" aria-label="Ekran ve işlem izinleri">
        <aside className="roles-areas"><div className="roles-areas-heading"><h2>Ekranlar</h2><span>{selectedScreens} / {groups.length}</span></div>
        <nav aria-label="Yetki alanları">{groups.map(item => { const count = draft.permissions.filter(p => p.startsWith(`${item.id}.`)).length; return <button type="button" key={item.id} className={groupId === item.id ? 'active' : ''} aria-pressed={groupId === item.id} onClick={() => setGroupId(item.id)}><span>{item.name}</span><span className={`roles-area-count${count ? ' has-permissions' : ''}`}>{count}</span><ChevronRight size={13}/></button>; })}</nav></aside>
        <div className="roles-permission-panel"><div className="roles-permission-heading"><div className="roles-panel-heading"><span className="roles-icon-tile"><ShieldCheck size={22}/></span><div><h2>{group?.name}</h2><p>Ekran erişimini ve yapılabilecek işlemleri seçin.</p></div></div><button className="roles-text-action" type="button" onClick={() => setDraft({ ...draft, permissions: allSelected ? draft.permissions.filter(p => !groupKeys.includes(p)) : [...new Set([...draft.permissions, ...groupKeys])] })}>{allSelected ? 'Seçimi kaldır' : 'Tümünü seç'}</button></div>
        <div className="roles-permission-rows">{group && Object.entries(group.actions).map(([action, label]) => {
          const key = `${group.id}.${action}`;
          return <label className={`roles-permission-row${action === 'view' ? ' roles-screen-access' : ''}`} key={key}>
            <span className="roles-check"><input type="checkbox" aria-label={label} checked={draft.permissions.includes(key)} onChange={e => toggle(key, e.target.checked)}/><span className="roles-check-box" aria-hidden="true"><Check size={13} strokeWidth={3}/></span></span>
            <span className="roles-permission-copy"><span className="roles-permission-title">{label}{action === 'view' && <span className="roles-badge">Ekran erişimi</span>}</span><span className="roles-permission-hint">{specificHints[key] ?? hints[action] ?? 'Bu işlem için yetki verir.'}</span></span>
          </label>;
        })}</div><div className="roles-permission-note"><Info size={15}/><p>İşlem izni seçildiğinde ekran erişimi de açılır. Ekran erişimini kapatınca bu ekranın işlem izinleri kaldırılır.</p></div></div>
      </section></fieldset>
      <ErrorMessage error={save.error}/>
      <div className="roles-editor-footer"><div className="roles-selection-summary"><ShieldCheck size={18}/><span><strong>{selectedScreens} ekran</strong> · {selectedActions} işlem izni<small>{editingTemplateId ? 'Bu şablondan sonra oluşturulacak rollerde kullanılır.' : 'Değişiklikler kaydedildiğinde bağlı personellere uygulanır.'}</small></span></div><div className="roles-footer-actions"><button type="button" className="button secondary" disabled={save.isPending} onClick={() => { setDraft(null); setEditingTemplateId(null); }}>Vazgeç</button><button className="button primary" disabled={save.isPending}><Save size={15}/>{save.isPending ? 'Kaydediliyor…' : editingTemplateId ? 'Şablonu kaydet' : 'Rolü kaydet'}</button></div></div>
    </form>}
    {deleteTarget && <DeleteModal title="Rolü sil" pending={remove.isPending} onClose={() => setDeleteTarget(null)} onConfirm={() => remove.mutate(deleteTarget.id)} error={<ErrorMessage error={remove.error}/>}><p>{deleteTarget.name} rolü silinecek. Kullanılan rolleri silmeden önce bağlı personellere başka rol atayın.</p></DeleteModal>}
  </main>;
}
