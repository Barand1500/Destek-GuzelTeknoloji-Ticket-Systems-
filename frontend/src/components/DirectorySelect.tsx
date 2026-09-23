import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api,errorText } from '../services/api';
import type { Page } from '../types';
import { DropdownSelect } from './DropdownSelect';
type Option={id:string;name:string};
export function DirectorySelect({endpoint,label,value,onChange,params={},current,optional=false,disabled=false}:{endpoint:string;label:string;value:string;onChange:(value:string)=>void;params?:Record<string,string>;current?:Option;optional?:boolean;disabled?:boolean}){
  const [page,setPage]=useState(1),[search,setSearch]=useState('');
  const query=useQuery({queryKey:['directory',endpoint,params,page,search],queryFn:async()=>(await api.get<Page<Option>>(endpoint,{params:{...params,page,limit:25,search:search||undefined}})).data});
  const options=[{value:'',label:optional?'Atanmamış':'Seçin'},...(current&&!query.data?.data.some(x=>x.id===current.id)?[{value:current.id,label:current.name}]:[]),...(query.data?.data??[]).map(item=>({value:item.id,label:item.name}))];
  return <div className="directory-select"><DropdownSelect label={label} ariaLabel={label} value={value} onChange={onChange} options={options} />{(query.data?.pagination.total??0)>25||search?<><input aria-label={`${label} ara`} placeholder="Listede ara…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/><div className="mini-pagination"><button type="button" disabled={page===1} onClick={()=>setPage(page-1)}>Önceki</button><span>{page}</span><button type="button" disabled={page>=(query.data?.pagination.totalPages??1)} onClick={()=>setPage(page+1)}>Sonraki</button></div></>:null}{query.isError&&<p className="error" role="alert">{errorText(query.error)}</p>}</div>;
}
