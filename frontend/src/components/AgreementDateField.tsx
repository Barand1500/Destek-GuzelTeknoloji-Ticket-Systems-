import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

const iso = (date: Date) => [String(date.getFullYear()).padStart(4, '0'), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
const parse = (value: string) => { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d); };
export function AgreementDateField({ label, name, value, onChange, min = '1000-01-01', max = '9999-12-31', disabled = false, readOnly = false }: { label: string; name: string; value: string; onChange: (value: string) => void; min?: string; max?: string; disabled?: boolean; readOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => value ? parse(value) : new Date());
  const [position, setPosition] = useState({ left: 0, top: 0, height: 340 });
  const root = useRef<HTMLDivElement>(null), anchor = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null);
  const today = iso(new Date());
  const close = () => { setOpen(false); anchor.current?.focus(); };
  useEffect(() => {
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', outside); return () => document.removeEventListener('mousedown', outside);
  }, []);
  useEffect(() => { if (disabled || readOnly) setOpen(false); }, [disabled, readOnly]);
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => { const rect = anchor.current?.getBoundingClientRect(); if (rect) setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 280)), top: rect.bottom + 8, height: Math.max(100, window.innerHeight - rect.bottom - 16) }); };
    measure(); popup.current?.showPopover();
    window.addEventListener('resize', measure); window.addEventListener('scroll', measure, true);
    return () => { if (popup.current?.matches(':popover-open')) popup.current.hidePopover(); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [open]);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(first); gridStart.setDate(1 - (first.getDay() + 6) % 7);
  const choose = (next: string) => { onChange(next); close(); };
  const dayCount = Math.ceil(((first.getDay() + 6) % 7 + new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) / 7) * 7;
  const previous = new Date(first.getFullYear(), first.getMonth(), 0), next = new Date(first.getFullYear(), first.getMonth() + 1, 1);
  return <div ref={root} className="agreement-field agreement-calendar-field" onKeyDown={event => { if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <span className="field-label">{label}</span>
    <div className="agreement-calendar-control"><input type="date" name={name} aria-label={label} required min={min} max={max} value={value} disabled={disabled} readOnly={readOnly} onChange={event => onChange(event.target.value)} /><button ref={anchor} type="button" className="agreement-calendar-trigger" aria-label={label + ' takvimini aç'} aria-expanded={open} disabled={disabled || readOnly} onClick={event => { event.preventDefault(); setMonth(parse(value || (today < min ? min : today > max ? max : today))); setOpen(v => !v); }}><CalendarDays size={16} /></button></div>
    {open && <div ref={popup} popover="manual" className="agreement-calendar-popup" role="dialog" aria-label={label + ' takvimi'} style={{ left: position.left, top: position.top, maxHeight: position.height }} onClick={event => { event.preventDefault(); event.stopPropagation(); }}>
      <div className="agreement-calendar-heading"><button type="button" aria-label="Önceki ay" disabled={iso(previous) < min} onClick={() => setMonth(new Date(first.getFullYear(), first.getMonth() - 1, 1))}><ChevronLeft size={16} /></button><strong>{first.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</strong><button type="button" aria-label="Sonraki ay" disabled={next.getFullYear() > 9999 || iso(next) > max} onClick={() => setMonth(next)}><ChevronRight size={16} /></button></div>
      <div className="agreement-calendar-grid">{['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map(day => <span key={day} className="agreement-calendar-weekday">{day}</span>)}{Array.from({ length: dayCount }, (_, index) => { const day = new Date(gridStart); day.setDate(day.getDate() + index); const key = iso(day); return <button key={key} type="button" aria-label={day.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })} aria-pressed={key === value} aria-current={key === today ? 'date' : undefined} className={day.getMonth() !== first.getMonth() ? 'outside-month' : ''} disabled={day.getFullYear() > 9999 || key < min || key > max} onClick={() => choose(key)}>{day.getDate()}</button>; })}</div>
      <div className="agreement-calendar-footer"><button type="button" onClick={() => choose('')}>Temizle</button><button type="button" disabled={today < min || today > max} onClick={() => choose(today)}>Bugün</button></div>
    </div>}
  </div>;
}
