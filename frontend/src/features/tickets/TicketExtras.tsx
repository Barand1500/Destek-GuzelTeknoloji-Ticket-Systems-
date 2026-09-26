import { useEffect, useState, type ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Paperclip,Download } from 'lucide-react';
import { createPortal } from 'react-dom';
import { api,errorText } from '../../services/api';
import { DropdownSelect, MultiDropdownSelect } from '../../components/DropdownSelect';
import type { Attachment,Page,Tag,Conversation } from '../../types';
export function FilePicker({files,setFiles,disabled=false}:{files:File[];setFiles:(files:File[])=>void;disabled?:boolean}){
  const [error,setError]=useState('');
  return <div className="file-picker"><label><Paperclip size={14}/>Dosya ekle<input type="file" aria-label="Dosya ekle" multiple disabled={disabled} accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.txt,.zip" onChange={e=>{const selected=Array.from(e.target.files??[]);if(selected.length>10||selected.some(f=>f.size>26214400)){setError('En fazla 10 dosya; her biri en fazla 25 MB olabilir.');setFiles([]);e.target.value='';}else{setError('');setFiles(selected);}}}/></label><small>JPG, PNG, WebP, PDF, DOCX, XLSX, TXT, ZIP · En fazla 10 dosya · 25 MB / dosya</small>{files.length>0&&<ul>{files.map((file,i)=><li key={`${file.name}-${i}`}>{file.name}<button type="button" aria-label={`${file.name} kaldır`} disabled={disabled} onClick={()=>setFiles(files.filter((_,index)=>index!==i))}>Kaldır</button></li>)}</ul>}{error&&<p className="error" role="alert">{error}</p>}</div>;
}
export function CompactFilePicker({setFiles,disabled=false}:{setFiles:(files:File[])=>void;disabled?:boolean}){
  const [error,setError]=useState('');
  function onChange(e:ChangeEvent<HTMLInputElement>){const selected=Array.from(e.target.files??[]);if(selected.length>10||selected.some(f=>f.size>26214400)){setError('En fazla 10 dosya; her biri en fazla 25 MB olabilir.');setFiles([]);e.target.value='';}else{setError('');setFiles(selected);}}
  return <div className="composer-file-picker"><label className={`composer-attachment-trigger ${disabled?'disabled':''}`} title="Dosya ekle"><Paperclip size={18}/><span className="sr-only">Dosya ekle</span><input type="file" aria-label="Dosya ekle" multiple disabled={disabled} accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.txt,.zip" onChange={onChange}/></label>{error&&<p className="error" role="alert">{error}</p>}</div>;
}
type PreviewFile = { name: string; mimeType: string; data: Blob };
function FilePreviewModal({ file, onClose }: { file: PreviewFile; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const isImage = file.mimeType.startsWith('image/');
  const canEmbed = isImage || file.mimeType === 'application/pdf' || file.mimeType.startsWith('text/');
  useEffect(() => {
    const nextUrl = URL.createObjectURL(file.data);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);
  if (!url) return null;
  return createPortal(<div className="attachment-preview-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="attachment-preview-modal" role="dialog" aria-modal="true" aria-label={`${file.name} önizlemesi`}>
      <header><button type="button" className="attachment-preview-name" title={`${file.name} indir`} onClick={() => { const link = document.createElement('a'); link.href = url; link.download = file.name; link.click(); }}>{file.name}</button><button type="button" onClick={onClose} aria-label="Önizlemeyi kapat">×</button></header>
      <div className="attachment-preview-content">{isImage ? <img src={url} alt={file.name} /> : canEmbed ? <iframe src={url} title={file.name} /> : <p>Bu dosya tarayıcıda önizlenemiyor. <a href={url} download={file.name}>İndir</a></p>}</div>
    </section>
  </div>, document.body);
}
export function ComposerFiles({files,setFiles,disabled=false}:{files:File[];setFiles:(files:File[])=>void;disabled?:boolean}){
  const [preview, setPreview] = useState<File | null>(null);
  return <><ul className="composer-file-list" aria-label="Gönderilecek dosyalar">{files.map((file,i)=><li key={`${file.name}-${i}`}><Paperclip size={12} aria-hidden="true"/><button type="button" className="composer-file-preview" title={file.name} onClick={()=>setPreview(file)}>{file.name}</button><button type="button" aria-label={`${file.name} kaldır`} disabled={disabled} onClick={()=>setFiles(files.filter((_,index)=>index!==i))}>×</button></li>)}</ul>{preview && <FilePreviewModal file={{ name: preview.name, mimeType: preview.type, data: preview }} onClose={() => setPreview(null)} />}</>;
}
export function AttachmentLinks({attachments}:{attachments:Attachment[]}){
  const [error,setError]=useState(''),[pending,setPending]=useState(''),[preview,setPreview]=useState<PreviewFile | null>(null);
  async function open(file:Attachment){setPending(file.id);setError('');try{const response=await api.get(`/attachments/${file.id}`,{responseType:'blob'});setPreview({name:file.originalName,mimeType:file.mimeType,data:response.data});}catch{setError('Dosya açılamadı veya erişim yetkiniz kalmadı.');}finally{setPending('');}}
  return <>{attachments?.length>0&&<div className="attachment-list">{attachments.map(file=><button key={file.id} type="button" title={file.originalName} disabled={pending===file.id} onClick={()=>void open(file)}><Download size={14}/><span>{file.originalName}</span><small>{Math.max(1,Math.round(file.size/1024))} KB</small></button>)}</div>}{preview&&<FilePreviewModal file={preview} onClose={()=>setPreview(null)}/>} {error&&<p className="error" role="alert">{error}</p>}</>;
}
export function SavedReplyPicker({onSelect}:{onSelect:(body:string)=>void}){
  const [search,setSearch]=useState(''),[page,setPage]=useState(1);
  const query=useQuery({queryKey:['saved-replies','picker',search,page],queryFn:async()=>(await api.get<Page<{id:string;title:string;body:string}>>('/saved-replies',{params:{search,page,limit:25}})).data});
  const options=[{value:'',label:'Bir hazır yanıt seçin'},...(query.data?.data??[]).map(reply=>({value:reply.id,label:reply.title}))];
  return <div className="saved-picker"><DropdownSelect ariaLabel="Hazır yanıt seçin" value="" onChange={value=>{const reply=query.data?.data.find(item=>item.id===value);if(reply)onSelect(reply.body);}} options={options}/>{(query.data?.pagination.total??0)>25||search?<><input aria-label="Hazır yanıtlarda ara" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Hazır yanıtlarda ara"/><div className="mini-pagination"><button type="button" disabled={page===1} onClick={()=>setPage(page-1)}>Önceki</button><button type="button" disabled={page>=(query.data?.pagination.totalPages??1)} onClick={()=>setPage(page+1)}>Sonraki</button></div></>:null}{query.isError&&<p className="error" role="alert">{errorText(query.error)}</p>}</div>;
}
export function TagEditor({ticket,onChange,disabled}:{ticket:Conversation;onChange:(ids:string[])=>void;disabled:boolean}){
  const query=useQuery({queryKey:['tags','picker','all'],queryFn:async()=>(await api.get<Page<Tag>>('/tags',{params:{limit:100}})).data});
  const selected=ticket.tags?.map(t=>t.tag.id)??[];
  return <div className="tag-editor"><MultiDropdownSelect label="Etiketler" value={selected} onChange={onChange} ariaLabel="Etiket seçin" options={(query.data?.data??[]).map(tag=>({value:tag.id,label:tag.name}))}/>{query.isError&&<p className="error" role="alert">{errorText(query.error)}</p>}</div>;
}
export function TagPicker({value,onChange}:{value:string[];onChange:(ids:string[])=>void}){
  const query=useQuery({queryKey:['tags','create-picker'],queryFn:async()=>(await api.get<Page<Tag>>('/tags',{params:{limit:100}})).data});
  return <MultiDropdownSelect label={"Etiket / g\u00f6r\u00fcn\u00fcm"} value={value} onChange={onChange} ariaLabel={"Etiket se\u00e7in"} options={(query.data?.data??[]).map(tag=>({value:tag.id,label:tag.name}))} />;
}
export function TagSelect({value,onChange}:{value:string[];onChange:(ids:string[])=>void}){
  const query=useQuery({queryKey:['tags','select'],queryFn:async()=>(await api.get<Page<Tag>>('/tags',{params:{limit:100}})).data});
  return <MultiDropdownSelect label={"Etiket / g\u00f6r\u00fcn\u00fcm"} value={value} onChange={onChange} ariaLabel={"Etiket se\u00e7in"} options={(query.data?.data??[]).map(tag=>({value:tag.id,label:tag.name}))} />;
}
export function FormDropdown({name,label,defaultValue,options}:{name:string;label:string;defaultValue:string;options:Array<{value:string;label:string}>}){
  const [value,setValue]=useState(defaultValue);
  return <><DropdownSelect label={label} ariaLabel={label} value={value} onChange={setValue} options={options}/><input type="hidden" name={name} value={value}/></>;
}
