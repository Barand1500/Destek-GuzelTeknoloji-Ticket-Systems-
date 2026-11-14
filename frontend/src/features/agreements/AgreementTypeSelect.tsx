import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { SearchableDropdown } from '../../components/SearchableDropdown';
import { api, errorText } from '../../services/api';
import { useAuth } from '../auth/Auth';
import { hasPermission } from '../auth/permissions';
export const baseAgreementTypes: Record<string, string> = { MONTHLY: 'Aylık', YEARLY: 'Yıllık', ONE_OFF: 'Ek Destek Kredisi', MAINTENANCE: 'Bakım Anlaşması' };
type Type = { id: string; name: string; builtIn: boolean };
export function AgreementTypeSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { user } = useAuth(); const client = useQueryClient(); const [name, setName] = useState('');
  const editable = user?.role !== 'CUSTOMER' && hasPermission(user, 'customers.update');
  const query = useQuery({ queryKey: ['agreement-types'], queryFn: async () => (await api.get('/agreement-types')).data.data as Type[] });
  const types = query.data?.length ? query.data : Object.entries(baseAgreementTypes).map(([id, name]) => ({ id, name, builtIn: true }));
  const add = useMutation({ mutationKey: ['agreement-types'], mutationFn: async () => (await api.post('/agreement-types', { name: name.trim() })).data.data as Type, onSuccess: async type => { client.setQueryData<Type[]>(['agreement-types'], old => [...(old ?? types), type]); setName(''); onChange(type.id); await client.invalidateQueries({ queryKey: ['agreement-types'] }); } });
  const remove = useMutation({ mutationKey: ['agreement-types'], mutationFn: (id: string) => api.delete('/agreement-types/' + id), onSuccess: async (_, id) => { if (value === id) onChange('MONTHLY'); await client.invalidateQueries({ queryKey: ['agreement-types'] }); } });
  const pending = add.isPending || remove.isPending;
  const submit = () => { if (name.trim() && !pending) add.mutate(); };
  return <div className="agreement-type-select"><SearchableDropdown placement="bottom" label="Anlaşma Türü" name="type" maxMenuHeight={290} value={value} onChange={onChange} disabled={pending} options={types.map(t => ({ value: t.id, label: t.name }))}
    optionAction={editable ? option => !types.find(t => t.id === option.value)?.builtIn ? <button type="button" className="agreement-type-remove" disabled={pending} aria-label={option.label + ' türünü sil'} title="Türü Sil" onClick={() => remove.mutate(option.value)}><Trash2 size={14} /></button> : null : undefined}
    footer={editable ? <div className="agreement-type-add"><input aria-label="Yeni Anlaşma Türü" placeholder="Yeni anlaşma türü…" maxLength={80} value={name} disabled={pending} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} /><button type="button" className="button secondary" aria-label="Anlaşma Türü Ekle" disabled={!name.trim() || pending} onClick={submit}><Plus size={16} /></button></div> : undefined} />
    {(query.error || add.error || remove.error) && <p className="error" role="alert">{errorText(query.error || add.error || remove.error)}</p>}
  </div>;
}
