import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { statuses, type Conversation, type Page } from '../../types';
import { conversationPath } from '../../router/paths';
import { useAuth } from '../auth/Auth';
import { Pagination, ErrorMessage } from './shared';
import { DropdownSelect } from '../../components/DropdownSelect';
import { SearchableDropdown } from '../../components/SearchableDropdown';
import { usePageSize } from '../../components/usePageSize';
import { ChevronDown } from 'lucide-react';
import { elapsedDuration } from '../../utils/elapsed-duration';

export function CustomerRequests({ customerId, name, expanded = false, people }: { customerId: string; name: string; expanded?: boolean; people?: { id: string; name: string }[] }) {
  const { user } = useAuth();
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = usePageSize('customer-existing-request-cards');
  const [status, setStatus] = useState('');
  const [personId, setPersonId] = useState('');
  useEffect(() => { setPersonId(''); setPage(1); }, [customerId]);

  const statusOptions = useQuery({ queryKey: ['status-options'], queryFn: async () => (await api.get<Page<{ id: string; code: string; name: string; color: string }>>('/status-options', { params: { limit: 100 } })).data.data });
  const statusNames = { ...statuses, ...Object.fromEntries((statusOptions.data ?? []).map(option => [option.code, option.name])) };
  const selectedCustomerId = personId || customerId;
  const requests = useQuery({
    queryKey: ['customer-existing-requests', selectedCustomerId, page, limit, status],
    queryFn: async () => (await api.get<Page<Conversation>>('/conversations', { params: { customerId: selectedCustomerId, view: 'all', page, limit, status: status || undefined } })).data,
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === selectedCustomerId && previousQuery.queryKey[4] === status ? previous : undefined,
    refetchInterval: 15_000,
  });
  useEffect(() => {
    if (requests.data && !requests.isPlaceholderData && page > Math.max(1, requests.data.pagination.totalPages)) setPage(Math.max(1, requests.data.pagination.totalPages));
  }, [requests.data, requests.isPlaceholderData, page]);
  const peopleOptions = people?.length && people.length > 1 ? people : undefined;
  const Container = expanded ? 'section' : 'details';
  const Heading = expanded ? 'div' : 'summary';
  return <Container className={`customer-existing-requests${expanded ? " customer-existing-requests-expanded" : ""}`} aria-label="Müşterinin mevcut talepleri">
    <Heading className="customer-requests-toggle"><div><h2>Mevcut Talepler{requests.data ? ` (${requests.data.pagination.total})` : ''}</h2><p>{expanded ? 'Mevcut görüşmeler ve talepler.' : `${name} için mevcut talepler.`}</p></div><ChevronDown size={20} aria-hidden="true" /></Heading>
    <div className="customer-requests-body">
    <div className="customer-requests-filters">
      {peopleOptions && <div><SearchableDropdown label="Kişi" name="personId" searchable searchPlaceholder="Kişi ara..." value={personId || customerId} options={peopleOptions.map(person => ({ value: person.id, label: person.name }))} onChange={value => { setPersonId(value); setPage(1); }} /></div>}
      <div><DropdownSelect label="Durum" ariaLabel="Mevcut talepler durum filtresi" value={status} options={[{ value: '', label: 'Tüm Durumlar' }, ...Object.entries(statusNames).map(([value, label]) => ({ value, label }))]} onChange={value => { setStatus(value); setPage(1); }} /></div>
      <div><DropdownSelect label="Kayıt sayısı" ariaLabel="Mevcut talepler kayıt sayısı" value={String(limit)} options={[10, 15, 20, 50].map(value => ({ value: String(value), label: String(value) }))} onChange={value => { setLimit(Number(value)); setPage(1); }} /></div>
    </div>
    {requests.isPending && <p role="status">Talepler yükleniyor…</p>}
    {requests.isError && <><ErrorMessage error={requests.error} /><button className="button secondary" type="button" onClick={() => void requests.refetch()}>Yeniden Dene</button></>}
    {requests.data && (requests.data.data.length ? <div className="customer-existing-requests-scroll customer-request-cards-scroll" tabIndex={0} role="region" aria-label="Mevcut talep kartları">
      <div className="customer-request-cards">
        {requests.data.data.map(request => <Link className="customer-request-card" to={conversationPath(user!.role, request.id)} key={request.id}>
          <div className="customer-request-card-heading"><strong>#{`TK-${String(request.number).padStart(5, '0')}`} · {request.subject}</strong><span className="customer-request-status" data-status={request.status}>{statusNames[request.status] ?? request.status}</span></div>
          <p className="customer-request-description" title={request.firstMessage ?? undefined}>{request.firstMessage === '' ? 'İlk mesaj metin içermiyor.' : request.firstMessage ?? 'Açıklama bulunmuyor.'}</p>
          <dl className="customer-request-dates">
            <div><dt>Atanan personel</dt><dd>{request.assignees?.length ? request.assignees.map(assignee => assignee.user.name).join(', ') : request.assignedAgent?.name ?? 'Atanmamış'}</dd></div>
            <div><dt>Açılış</dt><dd><time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' })}</time></dd></div>
            <div><dt>Geçen süre</dt><dd>{elapsedDuration(request.createdAt, now)}</dd></div>
            <div><dt>Son güncelleme</dt><dd><time dateTime={request.updatedAt}>{new Date(request.updatedAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' })}</time></dd></div>
          </dl>
        </Link>)}
      </div>
    </div> : <p className="muted">{status ? 'Seçilen filtrelere uygun bir talep bulunmuyor.' : 'Bu müşteri için erişebildiğiniz bir talep bulunmuyor.'} Yeni talep oluşturabilirsiniz.</p>)}
    <Pagination pagination={requests.data?.pagination} onChange={setPage} alwaysVisible />
    </div>
  </Container>;
}
