import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import './date-range.css';

const iso = (date: Date) => [String(date.getFullYear()).padStart(4, '0'), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
const parse = (value: string) => { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day); };
const label = (value: string) => value.split('-').reverse().join('.');

/** Single calendar popover: one click picks a day, two clicks pick a range. */
export function DateRangeField({ label: fieldLabel, from, to, onChange }: { label: string; from: string; to: string; onChange: (range: { from: string; to: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState('');
  const [hovered, setHovered] = useState('');
  const [month, setMonth] = useState(() => parse(from || to || new Date().toISOString().slice(0, 10)));
  const [position, setPosition] = useState({ left: 0, top: 0, height: 340 });
  const root = useRef<HTMLDivElement>(null), anchor = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null);
  const today = iso(new Date());
  const close = () => { setOpen(false); setPending(''); setHovered(''); };
  useEffect(() => {
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => { const rect = anchor.current?.getBoundingClientRect(); if (rect) setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 292)), top: rect.bottom + 8, height: Math.max(120, window.innerHeight - rect.bottom - 16) }); };
    measure();
    popup.current?.showPopover();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      if (popup.current?.matches(':popover-open')) popup.current.hidePopover();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open]);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(1 - (first.getDay() + 6) % 7);
  const dayCount = Math.ceil(((first.getDay() + 6) % 7 + new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) / 7) * 7;
  const previous = new Date(first.getFullYear(), first.getMonth() - 1, 1);
  const next = new Date(first.getFullYear(), first.getMonth() + 1, 1);
  const start = pending || from;
  const end = pending ? (hovered && hovered > pending ? hovered : '') : to;
  const commit = (nextFrom: string, nextTo: string) => { onChange({ from: nextFrom, to: nextTo }); close(); };
  const choose = (day: string) => {
    if (!pending) { setPending(day); return; }
    if (day === pending) { commit(pending, pending); return; }
    commit(day < pending ? day : pending, day < pending ? pending : day);
  };
  const display = from && to ? `${label(from)} – ${label(to)}` : from ? label(from) : '';
  return <div ref={root} className="date-range-field" onKeyDown={event => { if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); anchor.current?.focus(); } }}>
    <button
      ref={anchor}
      type="button"
      className="date-range-control"
      aria-label={`${fieldLabel} seç`}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => {
        if (open) { close(); return; }
        setPending(from && !to ? from : '');
        setMonth(parse(from || today));
        setOpen(true);
      }}
    >
      <span className="field-label">{fieldLabel}</span>
      <span className={display ? 'date-range-value' : 'date-range-placeholder'}>{display || 'Gün veya aralık seç'}</span>
      <CalendarDays className="date-range-icon" size={16} aria-hidden="true" />
    </button>
    {open && <div ref={popup} popover="manual" className="date-range-popup" role="dialog" aria-label={`${fieldLabel} takvimi`} style={{ left: position.left, top: position.top, maxHeight: position.height }} onClick={event => event.stopPropagation()}>
      <div className="date-range-heading">
        <button type="button" aria-label="Önceki ay" onClick={() => setMonth(previous)}><ChevronLeft size={16} /></button>
        <strong>{first.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</strong>
        <button type="button" aria-label="Sonraki ay" onClick={() => setMonth(next)}><ChevronRight size={16} /></button>
      </div>
      <p className="date-range-hint">{pending ? 'Bitiş gününü seçin. Tek gün için aynı güne tekrar dokunun.' : 'Başlangıç gününü seçin.'}</p>
      <div className="date-range-grid">
        {['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map(day => <span key={day} className="date-range-weekday">{day}</span>)}
        {Array.from({ length: dayCount }, (_, index) => {
          const day = new Date(gridStart);
          day.setDate(day.getDate() + index);
          const key = iso(day);
          const edge = key === start || key === end;
          const inRange = Boolean(start && end && key > start && key < end);
          return <button
            key={key}
            type="button"
            aria-label={day.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
            aria-pressed={edge}
            aria-current={key === today ? 'date' : undefined}
            className={[day.getMonth() !== first.getMonth() ? 'outside-month' : '', inRange ? 'in-range' : '', edge ? 'range-edge' : ''].filter(Boolean).join(' ')}
            onMouseEnter={() => setHovered(key)}
            onMouseLeave={() => setHovered('')}
            onClick={() => choose(key)}
          >{day.getDate()}</button>;
        })}
      </div>
      <div className="date-range-footer">
        <button type="button" onClick={() => commit('', '')}>Temizle</button>
        <button type="button" onClick={() => commit(today, today)}>Bugün</button>
      </div>
    </div>}
  </div>;
}
