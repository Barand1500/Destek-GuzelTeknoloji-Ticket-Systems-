import { useEffect, useRef, useState } from "react";
import { ChevronDown, Pencil } from "lucide-react";

type Option = { value: string; label: string };

export function SearchableDropdown({ label, name, value, options, onChange, disabled = false, placeholder = "Seçin", onEdit }: { label: string; name: string; value: string; options: Option[]; onChange: (value: string) => void; disabled?: boolean; placeholder?: string; onEdit?: () => void }) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((item) => item.value === value)?.label ?? '';
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setQuery(selectedLabel), [value, selectedLabel]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const matches = query === selectedLabel
    ? options
    : options.filter((item) => item.label.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")));
  return <div ref={ref} className={`styled-dropdown searchable-dropdown${open ? " open" : ""}${disabled ? " disabled" : ""}`}>
    {label && <span className="styled-dropdown-label">{label}{onEdit && <button type="button" className="searchable-dropdown-edit" aria-label={`${label} ekle veya düzenle`} title={`${label} ekle veya düzenle`} onClick={() => { inputRef.current?.focus(); onEdit(); }}><Pencil size={11} /></button>}</span>}
    <input type="hidden" name={name} value={value} />
    <input ref={inputRef} className="searchable-dropdown-input" aria-label={label} value={open ? query : selectedLabel} disabled={disabled} placeholder={placeholder} autoComplete="off" onFocus={() => { if (!disabled) { setQuery(selectedLabel); setOpen(true); } }} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} />
    <button type="button" className="searchable-dropdown-chevron" tabIndex={-1} aria-label={`${label} seçenekleri`} disabled={disabled} onClick={() => setOpen((current) => !current)}><ChevronDown size={15} /></button>
    {open && <div className="styled-dropdown-menu searchable-dropdown-menu" role="listbox">{matches.length ? matches.map((item) => <button type="button" role="option" aria-selected={item.value === value} key={item.value} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(item.value); setQuery(item.label); setOpen(false); }}>{item.label}</button>) : <span className="searchable-dropdown-empty">Sonuç bulunamadı</span>}</div>}
  </div>;
}
