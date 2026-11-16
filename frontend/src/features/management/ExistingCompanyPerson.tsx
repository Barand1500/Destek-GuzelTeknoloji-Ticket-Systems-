import {displayEmail} from '../../utils/email';
import {useState} from 'react';
import {useMutation,useQuery} from '@tanstack/react-query';
import {api,errorText} from '../../services/api';

type Candidate={id:string;name:string;email:string|null;company:string|null};
type Candidates={data:Candidate[];pagination:{total:number;totalPages:number}};

export function ExistingCompanyPerson({customerId,onPendingChange,onCancel,onAdded}:{customerId:string;onPendingChange:(value:boolean)=>void;onCancel:()=>void;onAdded:()=>Promise<void>}){
 const [input,setInput]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[selected,setSelected]=useState<Candidate|null>(null);
 const query=useQuery({queryKey:['company-person-candidates',customerId,search,page],queryFn:async({signal})=>(await api.get<Candidates>(`/customers/${customerId}/relation-candidates`,{signal,params:{direction:'CHILD',search,page,limit:10}})).data});
 const add=useMutation({mutationFn:async()=>{if(!selected) return;onPendingChange(true);await api.put(`/customers/${selected.id}/parent`,{parentCustomerId:customerId});},onSuccess:onAdded,onSettled:()=>onPendingChange(false)});
 return <section className="company-existing-person">
  <h3>Mevcut Kişiyi Şirkete Ekle</h3>
  <p className="muted">Başka bir şirkete bağlı olmayan kişiler listelenir. Eklenen kişi şirket kredisini kullanır.</p>
  <form className="company-existing-search" onSubmit={event=>{event.preventDefault();setSearch(input.trim());setPage(1);setSelected(null);add.reset();}}>
   <label className="agreement-field"><span className="field-label">Kişi Ara</span><input aria-label="Eklenecek kişiyi ara" value={input} maxLength={150} placeholder="Ad, e-posta veya telefon" disabled={add.isPending} onChange={event=>setInput(event.target.value)} /></label>
   <button className="button secondary" disabled={add.isPending}>Ara</button>
  </form>
  {(query.error||add.error)&&<p className="error" role="alert">{errorText(query.error||add.error)}</p>}
  {query.isPending&&<p role="status">Kişiler yükleniyor…</p>}
  <div className="company-existing-options" role="radiogroup" aria-label="Eklenecek Kişi">
   {query.data?.data.map((person,index)=><label key={person.id} className={selected?.id===person.id?'selected':''}><span className="company-existing-number">{(page-1)*10+index+1}</span><input type="radio" name="existing-person" value={person.id} checked={selected?.id===person.id} disabled={add.isPending} onChange={()=>{setSelected(person);add.reset();}} /><span className="company-existing-identity"><strong>{person.name}</strong><small>{displayEmail(person.email)||'E-posta yok'}{person.company?' · '+person.company:''}</small></span></label>)}
  </div>
  {query.data&&!query.data.data.length&&<p className="muted">Eklenebilecek kişi bulunamadı.</p>}
  {query.data&&query.data.pagination.totalPages>1&&<nav className="relation-pagination" aria-label="Mevcut Kişi Sayfaları"><button type="button" className="button secondary" disabled={page<=1||query.isFetching||add.isPending} onClick={()=>{setPage(page-1);setSelected(null);}}>Önceki</button><span>{page} / {query.data.pagination.totalPages}</span><button type="button" className="button secondary" disabled={page>=query.data.pagination.totalPages||query.isFetching||add.isPending} onClick={()=>{setPage(page+1);setSelected(null);}}>Sonraki</button></nav>}
  <div className="agreement-page-actions"><button type="button" className="button secondary" disabled={add.isPending} onClick={onCancel}>Vazgeç</button><button type="button" className="button primary" disabled={!selected||add.isPending||query.isFetching} onClick={()=>add.mutate()}>{add.isPending?'Ekleniyor…':'Seçilen Kişiyi Ekle'}</button></div>
 </section>;
}
