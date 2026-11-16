import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Trash2, ArrowLeft } from 'lucide-react';
import { api, errorText } from '../../services/api';

type Person = { id: string; name: string };
type PersonFile = { id: string; originalName: string; size: number };
export function CompanyPersonFiles({ person, canDelete, onBack, onPendingChange }: { person: Person; canDelete: boolean; onBack: () => void; onPendingChange: (pending: boolean) => void }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['/customers', person.id, 'files'], queryFn: async () => (await api.get<{data:PersonFile[]}>(`/customers/${person.id}/files`)).data.data });
  const remove = useMutation({ mutationFn: async (id: string) => { onPendingChange(true); await api.delete(`/customers/${person.id}/files/${id}`); }, onSuccess: async () => { await client.invalidateQueries({queryKey:['/customers',person.id,'files']}); }, onSettled: () => onPendingChange(false) });
  const download = useMutation({ mutationFn: async (file:PersonFile) => {
    const response = await api.get(`/customers/${person.id}/files/${file.id}/download`, {responseType:'blob'});
    const url=URL.createObjectURL(response.data); const link=document.createElement('a'); link.href=url; link.download=file.originalName; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  } });
  return <section className="company-people-panel"><button className="button secondary" type="button" disabled={remove.isPending} onClick={onBack}><ArrowLeft size={15}/> Kişilere Dön</button><h3>{person.name} — Dosyalar</h3>
    {(query.error || remove.error || download.error) && <p className="error" role="alert">{errorText(query.error || remove.error || download.error)}</p>}
    {query.isPending && <p role="status">Dosyalar yükleniyor…</p>}
    {query.data?.map(file=><div className="agreement-history" key={file.id}><div><strong>{file.originalName}</strong><small>{Math.ceil(file.size/1024)} KB</small></div><div className="management-actions"><button className="icon-button" type="button" aria-label={file.originalName+' indir'} disabled={download.isPending} onClick={()=>download.mutate(file)}><Download size={16}/></button>{canDelete&&<button className="icon-button danger-icon" type="button" aria-label={file.originalName+' dosyasını sil'} disabled={remove.isPending} onClick={()=>remove.mutate(file.id)}><Trash2 size={16}/></button>}</div></div>)}
    {query.data?.length===0&&<p className="muted">Bu kişiye ait dosya bulunmuyor.</p>}
  </section>;
}
