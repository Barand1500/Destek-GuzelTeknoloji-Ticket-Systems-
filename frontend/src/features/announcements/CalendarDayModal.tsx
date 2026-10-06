import { useEffect, useRef } from "react";
import { Megaphone, X } from "lucide-react";
import "./announcements.css";

export type CalendarAnnouncement = {
  id: string; title: string; body: string; authorName: string;
  eventAt: string | null; createdAt: string; priority: string;
};

export function CalendarDayModal({ date, announcements, onClose }: { date: Date; announcements: CalendarAnnouncement[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  return <dialog ref={dialog} className="announcements-modal calendar-day-modal" aria-labelledby="calendar-day-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="announcements-header">
      <div><h2 id="calendar-day-title">Günün detayları</h2><p>{date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })} · {announcements.length} duyuru</p></div>
      <button type="button" className="announcements-close" aria-label="Günün detaylarını kapat" onClick={onClose}><X size={21} /></button>
    </header>
    <div className="announcements-scroll calendar-day-announcements">
      {!announcements.length && <p className="announcement-muted">Bu tarihte duyuru yok.</p>}
      {announcements.map(item => <article className="calendar-day-announcement" key={item.id}>
        <h3><Megaphone size={16} />{item.title}</h3>
        <small>{item.authorName} · {new Date(item.eventAt ?? item.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</small>
        <p>{item.body}</p>
      </article>)}
    </div>
  </dialog>;
}
