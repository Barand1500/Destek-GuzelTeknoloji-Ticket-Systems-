import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileImage, FileText, X } from "lucide-react";
import { createPortal } from "react-dom";
import { api } from "../../services/api";

type GuideFile = { id: string; originalName: string; mimeType: string; size: number; createdAt: string };
export function ProjectGuideFileModal({ websiteId, projectName, canManage, onClose }: { websiteId: string; projectName: string; canManage?: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const files = useQuery({ queryKey: ["/websites", websiteId, "guide-files"], queryFn: async () => (await api.get<{ data: GuideFile[] }>(`/websites/${websiteId}/guide-files`)).data.data });
  const [activeId, setActiveId] = useState("");
  const activeFile = files.data?.find(file => file.id === activeId) ?? files.data?.[0];
  const content = useQuery({ queryKey: ["project-guide-modal-file", websiteId, activeFile?.id], queryFn: async () => (await api.get(`/websites/${websiteId}/guide-files/${activeFile!.id}/view`, { responseType: "blob" })).data as Blob, enabled: Boolean(activeFile), gcTime: 0 });
  const [url, setUrl] = useState("");
  useEffect(() => { if (!content.data) return; const next = URL.createObjectURL(content.data); setUrl(next); return () => URL.revokeObjectURL(next); }, [content.data]);
  const remove = useMutation({ mutationFn: (fileId: string) => api.delete(`/websites/${websiteId}/guide-files/${fileId}`), onSuccess: async () => { setActiveId(""); await Promise.all([client.invalidateQueries({ queryKey: ["/websites", websiteId, "guide-files"] }), client.invalidateQueries({ queryKey: ["/websites"] })]); } });
  return createPortal(<div className="attachment-preview-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="attachment-preview-modal project-guide-file-modal" role="dialog" aria-modal="true" aria-label={`${projectName} proje belgeleri`}>
      <header><strong>{projectName} - Proje belgeleri</strong><button type="button" onClick={onClose} aria-label="Kapat"><X size={18} /></button></header>
      {files.isPending ? <p className="project-guide-state">Belgeler yükleniyor…</p> : files.error ? <p className="error">Belgeler yüklenemedi.</p> : !files.data?.length ? <p className="project-guide-empty">Bu projeye henüz belge yüklenmemiş.</p> : <>
        <div className="attachment-preview-content">{content.isPending ? <p className="project-guide-state">Belge açılıyor…</p> : content.error ? <p className="error">Belge açılamadı.</p> : url && activeFile?.mimeType.startsWith("image/") ? <img src={url} alt={activeFile.originalName} /> : url ? <iframe src={url} title={activeFile?.originalName ?? "Proje belgesi"} /> : null}</div>
        <nav className="project-guide-modal-files" aria-label="Proje belgeleri">
          {files.data.map(file => <span key={file.id}>
            <button type="button" className={activeFile?.id === file.id ? "active" : ""} onClick={() => setActiveId(file.id)} aria-pressed={activeFile?.id === file.id}>
              {file.mimeType.startsWith("image/") ? <FileImage size={15} /> : <FileText size={15} />}<span>{file.originalName}</span>
            </button>
            {canManage && <button type="button" className="project-guide-file-delete" aria-label={`${file.originalName} dosyasını sil`} disabled={remove.isPending} onClick={() => { if (window.confirm(`“${file.originalName}” dosyası silinsin mi?`)) remove.mutate(file.id); }}>Dosyayı sil</button>}
          </span>)}
        </nav>
        {remove.error && <p className="error" role="alert">Dosya silinemedi. Lütfen tekrar deneyin.</p>}
      </>}
    </section>
  </div>, document.body);
}
