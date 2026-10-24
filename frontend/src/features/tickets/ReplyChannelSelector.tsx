import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '../../services/api';
import { channels, type Conversation } from '../../types';
import { contactChannels } from '../../utils/contact-channels';
type Channel = 'TICKET'|'EMAIL'|'SMS'|'WHATSAPP'|'FORM';
export function ReplyChannelSelector({ conversation, editable }: { conversation: Conversation; editable: boolean }) {
  const client=useQueryClient();
  const root=useRef<HTMLDivElement>(null);
  const popover=useRef<HTMLDivElement>(null);
  const [position,setPosition]=useState<CSSProperties>({});
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState<Channel[]>([]);
  const available=useQuery({queryKey:['communication-channels'],enabled:editable,queryFn:async()=>(await api.get<{data:{EMAIL:boolean;SMS:boolean;WHATSAPP:boolean;FORM:boolean}}>('/communication-channels')).data.data});
  const saved=conversation.replyChannels?.length?conversation.replyChannels:[conversation.channel==='LIVE_CHAT'?'TICKET':conversation.channel];
  const names=saved.map(value=>channels[value]).join(', ');
  const text=`Bu talebin yanıt ${saved.length>1?'kanalları':'kanalı'}: ${names}.`;
  const options=contactChannels(conversation.customer,available.data).map(value=>({value,label:value==='TICKET'?'Telefon':channels[value]}));
  const validDraft=draft.filter(value=>options.some(option=>option.value===value));
  const save=useMutation({mutationFn:async(replyChannels:Channel[])=>api.patch(`/conversations/${conversation.id}`,{replyChannels}),onSuccess:(_,replyChannels)=>{
    client.setQueryData<Conversation>(['conversation',conversation.id],current=>current?{...current,replyChannels}:current);
    void client.invalidateQueries({queryKey:['conversation',conversation.id]});setEditing(false);
    void client.invalidateQueries({queryKey:['conversations']});
  }});
  useEffect(()=>{
    if(!editing)return;
    const close=(event:PointerEvent)=>{if(!save.isPending&&!root.current?.contains(event.target as Node)&&!popover.current?.contains(event.target as Node))setEditing(false);};
    document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);
  },[editing,save.isPending]);
  useLayoutEffect(()=>{
    if(!editing)return;
    const place=()=>{
      if(!root.current)return;
      const anchor=root.current.getBoundingClientRect();
      const width=Math.min(250,window.innerWidth-24);
      const above=Math.max(0,anchor.top-18),below=Math.max(0,window.innerHeight-anchor.bottom-18);
      const menuHeight=(popover.current?.scrollHeight??0)+2;
      const opensAbove=below<menuHeight&&above>below;
      setPosition({width,left:Math.max(12,Math.min(anchor.right-width,window.innerWidth-width-12)),
        top:opensAbove?undefined:anchor.bottom+6,bottom:opensAbove?window.innerHeight-anchor.top+6:undefined,
        maxHeight:opensAbove?above:below});
    };
    place();
    window.addEventListener('resize',place);
    window.addEventListener('scroll',place,true);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[editing,options.length,save.isError,available.isError]);
  useEffect(()=>{if(!editable)setEditing(false);},[editable]);
  const open=()=>{if(!editable||save.isPending)return;setDraft(saved.filter(value=>options.some(option=>option.value===value)) as Channel[]);save.reset();setEditing(true);};
  return <div className="composer-channel-control" ref={root}>
    <span className="management-pill composer-channel-pill" tabIndex={editable?0:undefined} aria-expanded={editable?editing:undefined} title={editable?'Çift tıklayarak yanıt kanallarını seçin':undefined} onDoubleClick={open} onKeyDown={event=>{if(event.key==='Escape')setEditing(false);if(editable&&(event.key==='Enter'||event.key==='F2')){event.preventDefault();open();}}}>{text}</span>
    {editing&&createPortal(<div ref={popover} style={position} className="composer-channel-popover" role="dialog" aria-label="Yanıt Kanallarını Seçin" onKeyDown={event=>{if(event.key==='Escape'&&!save.isPending){event.stopPropagation();setEditing(false);}}}>
      {options.map(option=><label className="composer-channel-option" key={option.value}><input type="checkbox" checked={draft.includes(option.value)} disabled={save.isPending} onChange={()=>setDraft(current=>current.includes(option.value)?current.filter(value=>value!==option.value):[...current,option.value])}/><span>{option.label}</span></label>)}
      {!options.length&&<p className="muted">Kanal seçmek için müşteri bilgilerine telefon veya E-Posta ekleyin.</p>}
      <div className="composer-channel-popover-actions"><button type="button" disabled={!validDraft.length||save.isPending||available.isPending||available.isError} onClick={()=>save.mutate(validDraft)}>{save.isPending?'Kaydediliyor…':'Kaydet'}</button><button type="button" disabled={save.isPending} onClick={()=>setEditing(false)}>Vazgeç</button></div>
      {(save.isError||available.isError)&&<p className="error" role="alert">{errorText(save.error??available.error)}</p>}
    </div>,document.body)}
  </div>;
}
