import {DropdownSelect} from '../../components/DropdownSelect';
import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {api,errorText} from '../../services/api';
import {useAuth} from '../auth/Auth';
import {hasPermission} from '../auth/permissions';
import {conversationPath} from '../../router/paths';

type CreditReport={totalCredits:number;staff:{id:string;name:string;credits:number;count:number}[];pagination:{page:number;total:number;totalPages:number};data:{id:string;credits:number;createdAt:string;actor:{id:string;name:string};agreement:{name:string}|null;conversation:{id:string;number:number;subject:string;customer:{name:string};department:{name:string}}}[]};
const number=(value:number)=>new Intl.NumberFormat('tr-TR').format(value);

export function StaffCreditReport({days,agentId,departmentId,onPersonSelect}:{days:number;agentId?:string;departmentId?:string;onPersonSelect:(id:string)=>void}){
 const {user}=useAuth();const [page,setPage]=useState(1);const [searchInput,setSearchInput]=useState('');const [search,setSearch]=useState('');const [creditType,setCreditType]=useState('all');const [limit,setLimit]=useState(20);
 useEffect(()=>{const timer=window.setTimeout(()=>{setSearch(searchInput.trim());setPage(1);},300);return()=>window.clearTimeout(timer);},[searchInput]);
 const query=useQuery({queryKey:['/reports','credit-usage',days,agentId,departmentId,page,search,creditType,limit],staleTime:30_000,queryFn:async({signal})=>(await api.get<CreditReport>('/reports/credit-usage',{signal,params:{days,agentId,departmentId,page,limit,search:search||undefined,creditType}})).data});
 const data=query.data;
 return <section className="report-panel report-credit-usage">
  <div className="report-panel-heading"><h2>Personel Kredi Kullanımları</h2>{data&&<div className="report-credit-totals" aria-label="Kredi ve Talep Toplamları"><strong className="report-credit-total"><span className="credit-value">{number(data.totalCredits)}</span> kredi</strong><strong className="report-credit-count">{number(data.pagination.total)} talep</strong></div>}</div>
  <p className="report-note">Son {days} gün içindeki kredi kullanımları. Personel bilgisi krediyi kullanan kişiyi gösterir.</p>
  <form className="report-credit-filters" onSubmit={event=>event.preventDefault()}>
   <label className="report-credit-search"><span className="field-label">Ara</span><input aria-label="Personel, Talep veya Müşteri Ara" value={searchInput} maxLength={100} onChange={event=>setSearchInput(event.target.value)} /></label>
   
   <DropdownSelect label="Kredi Kullanımı" ariaLabel="Kredi Kullanımı Filtresi" value={creditType} options={[{value:'all',label:'Tüm Kullanımlar'},{value:'paid',label:'Kredi Harcananlar'},{value:'free',label:'Ücretsiz Destekler'}]} onChange={value=>{setCreditType(value);setPage(1);}} />
   <DropdownSelect label="Sayfa Başına" ariaLabel="Kredi Kayıt Sayısı" value={String(limit)} options={[10,20,50].map(value=>({value:String(value),label:String(value)+' kayıt'}))} onChange={value=>{setLimit(Number(value));setPage(1);}} />
   {(search||searchInput||creditType!=='all')&&<button className="button secondary" type="button" onClick={()=>{setSearch('');setSearchInput('');setCreditType('all');setPage(1);}}>Temizle</button>}
  </form>
  {query.isPending&&<p role="status">Kredi kullanımları yükleniyor…</p>}
  {query.error&&<div><p className="error" role="alert">{errorText(query.error)}</p><button className="button secondary" type="button" onClick={()=>void query.refetch()}>Tekrar Dene</button></div>}
  {data&&<div className="management-table-wrap report-credit-table-wrap"><table className="management-table report-credit-table" aria-label="Personel Kredi Kullanımları"><thead><tr><th>Tarih / Saat</th><th>Personel</th><th>Talep</th><th>Müşteri</th><th>Departman</th><th>Anlaşma</th><th>Kullanılan Kredi</th></tr></thead><tbody>
   {data.data.map(row=><tr key={row.id}><td>{new Date(row.createdAt).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})}</td><td><button type="button" className="report-credit-person" onClick={()=>onPersonSelect(row.actor.id)} aria-label={`${row.actor.name} kişi raporunu aç`}>{row.actor.name}</button></td><td>{hasPermission(user,'conversations.view')?<Link to={conversationPath(user!.role,row.conversation.id)}>#TK-{String(row.conversation.number).padStart(5,'0')}</Link>:<span>#TK-{String(row.conversation.number).padStart(5,'0')}</span>}<small>{row.conversation.subject}</small></td><td>{row.conversation.customer.name}</td><td>{row.conversation.department.name}</td><td>{row.agreement?.name??'Ücretsiz destek'}</td><td><strong className="report-credit-amount">{number(row.credits)}</strong></td></tr>)}
   {!data.data.length&&<tr><td colSpan={7} className="report-note">Arama ve filtrelere uygun kredi kullanımı bulunmuyor.</td></tr>}
  </tbody></table></div>}
  {data&&data.pagination.total>0&&<nav className="pagination" aria-label="Kredi Kullanım Sayfaları"><span>{number((page-1)*limit+1)}–{number(Math.min(page*limit,data.pagination.total))} / {number(data.pagination.total)} kayıt · Sayfa {page} / {data.pagination.totalPages}</span><div><button className="button secondary" type="button" disabled={query.isFetching||page<=1} onClick={()=>setPage(value=>value-1)}>Önceki</button><button className="button secondary" type="button" disabled={query.isFetching||page>=data.pagination.totalPages} onClick={()=>setPage(value=>value+1)}>Sonraki</button></div></nav>}
 </section>;
}
