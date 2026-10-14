import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, ArrowLeft, UserRoundPlus } from 'lucide-react';
import { api, errorText } from '../../services/api';
import { DropdownSelect } from '../../components/DropdownSelect';

type Customer = { id: string; name: string; email: string | null; phone: string | null; company: string | null };
type Group = { key: string; value: string; customers: Customer[] };
type Field = 'name' | 'email' | 'company' | 'phone';
export function CustomerMergeModal({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const [field, setField] = useState<Field>('name');
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [group, setGroup] = useState<Group | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState('');


  const groups = useQuery({ queryKey: ['/customers', 'duplicates', field, submittedSearch], queryFn: async () => (await api.get<{data: Group[]}>('/customers/duplicates', {params: { field, search: submittedSearch }})).data.data });
  const merge = useMutation({ mutationFn: async () => api.post(`/customers/${target}/merge`, {sourceIds: selected.filter(id => id !== target)}), onSuccess: async () => { await client.invalidateQueries(); onClose(); } });
  const resetSelection = () => { setGroup(null); setSelected([]); setTarget('');  merge.reset(); };

  const toggle = (id: string) => {  setSelected(current => current.includes(id) ? current.filter(item => item !== id) : current.length < 51 ? [...current, id] : current); if (target === id) setTarget(''); };
  return <div className="confirm-backdrop customer-merge-backdrop"><section className="confirm-modal customer-merge-modal" role="dialog" aria-modal="true" aria-label="Mükerrer Müşterileri Birleştir">
    <button className="standard-modal-close" type="button" aria-label="Kapat" disabled={merge.isPending} onClick={onClose}><X size={18}/></button>
    <h2><UserRoundPlus size={22}/> Müşterileri Birleştir</h2>
    {!group ? <>
      <p>Aynı bilgiye sahip kayıtları bulun, ardından birleştireceğiniz müşterileri seçin.</p>
      <form className="customer-merge-filters" onSubmit={event => {event.preventDefault(); setSubmittedSearch(search.trim());}}>
        <DropdownSelect label="Eşleştirilecek Bilgi" ariaLabel="Eşleştirilecek Bilgi" value={field} onChange={value => {setField(value as Field); setSearch(''); setSubmittedSearch(''); resetSelection();}} options={[{value:'name',label:'Ad Soyad'},{value:'email',label:'E-Posta'},{value:'company',label:'Şirket'},{value:'phone',label:'Telefon'}]}/>
        <label><span className="field-label">Eşleşmelerde Ara</span><input autoFocus value={search} maxLength={100} onChange={event=>setSearch(event.target.value)} placeholder="Arama değeri yazınız"/></label>
        <button className="button secondary" type="submit">Ara</button>
      </form>
      <div className="customer-merge-groups">
        {groups.isPending && <p role="status">Eşleşmeler aranıyor…</p>}
        {groups.isError && <p className="error" role="alert">{errorText(groups.error)}</p>}
        {!groups.isPending && !groups.isError && !groups.data?.length && <p>Bu bilgiye göre mükerrer müşteri bulunamadı.</p>}
        {groups.data?.map(item=><button className="customer-merge-group" type="button" key={item.key} onClick={()=>{setGroup(item);setSelected([]);setTarget('');}}><strong>{item.value}</strong><span>{item.customers.length} kayıt</span></button>)}
      </div>
    </> : <>
      <button className="button secondary" disabled={merge.isPending} onClick={resetSelection}><ArrowLeft size={16}/> Eşleşmelere Dön</button>
      <p>Eşleşen bilgi: <strong>{group.value}</strong>. Birleştirilecek kayıtları seçin.</p>
      <div className="customer-merge-candidates">{group.customers.map(customer=><label className="customer-merge-candidate" key={customer.id}><input type="checkbox" checked={selected.includes(customer.id)} disabled={merge.isPending || (!selected.includes(customer.id)&&selected.length>=51)} onChange={()=>toggle(customer.id)}/><span><strong>{customer.name}</strong><small>{[customer.email,customer.phone,customer.company].filter(Boolean).join(' · ') || 'İletişim bilgisi yok'}</small></span></label>)}</div>
      <DropdownSelect label="Korunacak Ana Kayıt" ariaLabel="Korunacak Ana Kayıt" value={target} onChange={value=>{if(!merge.isPending){setTarget(value);}}} options={[{value:'',label:'Ana Kaydı Seçin'},...group.customers.filter(customer=>selected.includes(customer.id)).map(customer=>({value:customer.id,label:[customer.name,customer.email,customer.phone].filter(Boolean).join(' · ')}))]}/>
      <p>{selected.length} kayıt seçildi. Ana kaydın adı korunur; diğer iletişim bilgileri, talepler ve dosyalar bu kayda aktarılır.</p>
      {merge.isError&&<p className="error" role="alert">{errorText(merge.error)}</p>}
      <div className="management-actions"><button className="button primary" disabled={selected.length<2||!selected.includes(target)||merge.isPending} onClick={()=>merge.mutate()}>{merge.isPending?'Birleştiriliyor…':'Seçilenleri Birleştir'}</button><button className="button secondary" disabled={merge.isPending} onClick={onClose}>Vazgeç</button></div>
    </>}
  </section></div>;
}
