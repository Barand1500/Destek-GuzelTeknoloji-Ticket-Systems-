import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '../../services/api';
import type { Conversation, User } from '../../types';
import { formatPhone } from '../../utils/phone';

type Field = 'name' | 'phone' | 'email' | 'company' | 'extraPhones' | 'extraEmails';
const labels: Record<Field, string> = { name: 'Ad Soyad', phone: 'Telefon', email: 'E-Posta', company: 'Şirket', extraPhones: 'Ek Telefon', extraEmails: 'Ek E-Posta' };
const formatField = (field: Field, value: string) => field === 'phone' ? formatPhone(value) : field === 'extraPhones' ? value.split(/[,;\n]+/).map(phone => formatPhone(phone.trim())).filter(Boolean).join(', ') : value;
export function EditableCustomerSummary({ customer, canEdit }: { customer: User; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Field | null>(null);
  const [value, setValue] = useState('');
  const save = useMutation({
    mutationFn: async ({ field, value }: { field: Field; value: string }) =>
      (await api.patch(`/customers/${customer.id}`, { [field]: value })).data.data as User,
    onSuccess: (updated, input) => {
      queryClient.setQueriesData<Conversation>({ queryKey: ['conversation'] }, current =>
        current?.customer.id === customer.id ? { ...current, customer: { ...current.customer, [input.field]: input.value, ...updated } } : current);
      setEditing(null);
      for (const key of ['conversation', 'conversations', 'messages', '/customers', 'directory'])
        void queryClient.invalidateQueries({ queryKey: [key] });
    },
  });
  const start = (field: Field) => {
    if (!canEdit || save.isPending) return;
    save.reset(); setValue(formatField(field, customer[field] ?? '')); setEditing(field);
  };
  function field(field: Field, prefix = '') {
    const current = customer[field];
    if (!current && field !== 'name') return null;
    if (editing === field) return <span key={field} className="customer-summary-field"><input key={field} className="customer-summary-editor" aria-label={labels[field]} type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'} inputMode={field === 'phone' || field === 'extraPhones' ? 'tel' : undefined} autoFocus value={value} disabled={save.isPending} maxLength={field === 'name' ? 100 : field === 'phone' ? 30 : field === 'company' ? 120 : field === 'email' ? 254 : 500} onChange={event => setValue(field === 'phone' ? formatPhone(event.target.value) : event.target.value)} onFocus={event => event.currentTarget.select()} onBlur={() => { if (!save.isPending) { setEditing(null); save.reset(); } }} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); setEditing(null); save.reset(); }
      if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
        event.preventDefault();
        if (save.isPending) return;
        if (value === formatField(field, current ?? '')) { setEditing(null); return; }
        save.mutate({ field, value: value.trim() });
      }
    }} /></span>;
    const props = { onDoubleClick: () => start(field), tabIndex: canEdit ? 0 : undefined, title: canEdit ? `${labels[field]}: çift tıklayarak düzenleyin; Enter ile kaydedin` : undefined, onKeyDown: (event: React.KeyboardEvent) => { if (canEdit && (event.key === 'Enter' || event.key === 'F2')) { event.preventDefault(); start(field); } }, className: canEdit ? 'customer-summary-editable' : undefined };
    return <span key={field} className="customer-summary-field"><span {...props}>{prefix}{formatField(field, current ?? '')}</span></span>;
  }
  return <>{field('name')}{field('phone')}{field('email')}{field('company')}{field('extraPhones', 'Ek tel: ')}{field('extraEmails', 'Ek E-Posta: ')}{save.isError && <span className="error" role="alert">{errorText(save.error)}</span>}{save.isPending && <span role="status">Kaydediliyor…</span>}</>;
}
