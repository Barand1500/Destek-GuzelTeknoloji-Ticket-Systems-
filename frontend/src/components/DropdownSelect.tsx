import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export function DropdownSelect({ label, value, options, onChange, ariaLabel }: { label?: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; ariaLabel: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const current = options.find(option => option.value === value)?.label ?? options[0]?.label ?? "Seçin";
  return <div ref={ref} className={`styled-dropdown${open ? " open" : ""}`}>
    {label && <span className="styled-dropdown-label">{label}</span>}
    <button type="button" className="styled-dropdown-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(value => !value)}><span>{current}</span><ChevronDown size={15} /></button>
    {open && <div className="styled-dropdown-menu" role="listbox">{options.map(option => <button type="button" role="option" aria-selected={option.value === value} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}>{option.label}</button>)}</div>}
  </div>;
}

export function MultiDropdownSelect({ label, value, options, onChange, ariaLabel }: { label?: string; value: string[]; options: Array<{ value: string; label: string }>; onChange: (value: string[]) => void; ariaLabel: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const selected = options.filter((option) => value.includes(option.value));
  const current = selected.length === 0
    ? "Etiket seçin"
    : selected.length === 1
      ? selected[0].label
      : `${selected.length} etiket seçildi`;
  return <div ref={ref} className={`styled-dropdown${open ? " open" : ""}`}>
    {label && <span className="styled-dropdown-label">{label}</span>}
    <button type="button" className="styled-dropdown-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((currentOpen) => !currentOpen)}><span>{current}</span><ChevronDown size={15} /></button>
    {open && <div className="styled-dropdown-menu" role="listbox" aria-multiselectable="true"><input className="styled-dropdown-search" aria-label={`${ariaLabel} ara`} placeholder="Ara..." value={search} onChange={(event) => setSearch(event.target.value)} />{options.filter((option) => option.label.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR'))).map((option) => {
      const checked = value.includes(option.value);
      return <button type="button" role="option" aria-selected={checked} key={option.value} onClick={() => onChange(checked ? value.filter((id) => id !== option.value) : [...value, option.value])}><span className={`styled-dropdown-check${checked ? " checked" : ""}`}>{checked ? "✓" : ""}</span>{option.label}</button>;
    })}</div>}
  </div>;
}
