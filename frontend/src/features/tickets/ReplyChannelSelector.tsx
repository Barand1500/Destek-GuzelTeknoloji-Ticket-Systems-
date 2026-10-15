import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '../../services/api';
import { channels, type Conversation } from '../../types';
type Channel = 'TICKET'|'EMAIL'|'SMS'|'WHATSAPP';
export function ReplyChannelSelector({ conversation, editable }: { conversation: Conversation; editable: boolean }) {
  const client=useQueryClient();
  const root=useRef<HTMLDivElement>(null);
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState<Channel[]>([]);
  const available=useQuery({queryKey:['communication-channels'],enabled:editable,queryFn:async()=>(await api.get<{data:{EMAIL:boolean;SMS:boolean;WHATSAPP:boolean}}>('/communication-channels')).data.data});
  const saved=conversation.replyChannels?.length?conversation.replyChannels:[conversation.channel==='LIVE_CHAT'?'TICKET':conversation.channel];
  const names=saved.map(value=>channels[value]).join(', ');
  const text=`Bu talep ${names} ${saved.length>1?'kanalları':'kanalı'} tercih edilerek açıldı.`;
  const options: {value:Channel;label:string}[]=[{value:'TICKET',label:'Telefon'},...(['EMAIL','SMS','WHATSAPP'] as const).filter(value=>available.data?.[value]).map(value=>({value,label:channels[value]}))];
  const save=useMutation({mutationFn:async()=>api.patch(`/conversations/${conversation.id}`,{replyChannels:draft}),onSuccess:()=>{
    client.setQueryData<Conversation>(['conversation',conversation.id],current=>current?{...current,replyChannels:draft}:current);
    void client.invalidateQueries({queryKey:['conversation',conversation.id]});setEditing(false);
  }});
  useEffect(()=>{
    if(!editing)return;
    const close=(event:PointerEvent)=>{if(!save.isPending&&!root.current?.contains(event.target as Node))setEditing(false);};
    document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);
  },[editing,save.isPending]);
  useEffect(()=>{if(!editable)setEditing(false);},[editable]);
  const open=()=>{if(!editable||save.isPending)return;setDraft(saved.filter(value=>options.some(option=>option.value===value)) as Channel[]);save.reset();setEditing(true);};
  return <div className="composer-channel-control" ref={root}>
    <span className="management-pill composer-channel-pill" tabIndex={editable?0:undefined} aria-expanded={editable?editing:undefined} title={editable?'Çift tıklayarak yanıt kanallarını seçin':undefined} onDoubleClick={open} onKeyDown={event=>{if(event.key==='Escape')setEditing(false);if(editable&&(event.key==='Enter'||event.key==='F2')){event.preventDefault();open();}}}>{text}</span>
    {editing&&<div className="composer-channel-popover" role="dialog" aria-label="Yanıt Kanallarını Seçin" onKeyDown={event=>{if(event.key==='Escape'&&!save.isPending){event.stopPropagation();setEditing(false);}}}>
      {options.map(option=><label className="composer-channel-option" key={option.value}><input type="checkbox" checked={draft.includes(option.value)} disabled={save.isPending} onChange={()=>setDraft(current=>current.includes(option.value)?current.filter(value=>value!==option.value):[...current,option.value])}/><span>{option.label}</span></label>)}
      <div className="composer-channel-popover-actions"><button type="button" disabled={!draft.length||save.isPending||available.isPending||available.isError} onClick={()=>save.mutate()}>{save.isPending?'Kaydediliyor…':'Kaydet'}</button><button type="button" disabled={save.isPending} onClick={()=>setEditing(false)}>Vazgeç</button></div>
      {(save.isError||available.isError)&&<p className="error" role="alert">{errorText(save.error??available.error)}</p>}
    </div>}
  </div>;
}
