import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { ErrorMessage } from './shared';

function localDateTime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function IncomingStartModal({ value, canEdit, onClose }: { value: string | null; canEdit: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState(value ? localDateTime(value) : '');
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (incomingMessagesSince: string | null) => api.patch('/integrations/incoming-start', { incomingMessagesSince }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['/integrations'] }); onClose(); },
  });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.showModal();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (canEdit && !save.isPending) save.mutate(date ? new Date(date).toISOString() : null);
  }
  return createPortal(<dialog ref={dialog} className="incoming-start-modal" aria-labelledby="incoming-start-title" onCancel={event => { event.preventDefault(); if (!save.isPending) onClose(); }}>
    <form onSubmit={submit}>
      <div className="incoming-start-heading"><h2 id="incoming-start-title">Gelen mesaj başlangıcı</h2><button type="button" className="standard-modal-close" aria-label="Kapat" disabled={save.isPending} onClick={onClose}><X size={20} /></button></div>
      <p>Seçtiğiniz tarihten eski mesajlar alınmaz. E-posta, SMS ve WhatsApp için geçerlidir.</p>
      <label className="incoming-start-field"><span>Başlangıç tarihi ve saati</span><input type="datetime-local" aria-label="Başlangıç tarihi ve saati" value={date} disabled={!canEdit || save.isPending} onChange={event => { setDate(event.target.value); save.reset(); }} /></label>
      <div className="incoming-start-warning"><AlertTriangle size={19} aria-hidden="true" /><p>Tarih boşsa eski e-postalar da gelebilir. WhatsApp ve SMS geçmişi taranmaz. Tarih seçiliyse, tarihi belli olmayan mesajlar alınmaz.</p></div>
      <ErrorMessage error={save.error} />
      <div className="incoming-start-actions"><button type="button" className="button secondary" disabled={save.isPending} onClick={onClose}>Vazgeç</button><button className="button primary" disabled={!canEdit || save.isPending}>{save.isPending ? 'Kaydediliyor…' : 'Kaydet'}</button></div>
    </form>
  </dialog>, document.body);
}
