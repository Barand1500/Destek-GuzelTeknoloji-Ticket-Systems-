import { useEffect, useRef, useState } from "react";
import { ChevronDown, Pencil } from "lucide-react";

type Option = { value: string; label: string; presence?: "ONLINE" | "IDLE" | "OFFLINE" };
const presenceLabels = { ONLINE: "Çevrim içi", IDLE: "Boşta", OFFLINE: "Çevrim dışı" } as const;

export function SearchableDropdown({ label, name, value, options, onChange, disabled = false, placeholder = "Seçin", onEdit }: { label: string; name: string; value: string; options: Option[]; onChange: (value: string) => void; disabled?: boolean; placeholder?: string; onEdit?: () => void }) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((item) => item.value === value)?.label ?? '';
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const optionContent = (item: Option) => <>{item.label}{item.presence && <span className={`presence-option-status presence-${item.presence}`}><i />{presenceLabels[item.presence]}</span>}</>;
  return <div ref={ref} className={`styled-dropdown searchable-dropdown${open ? " open" : ""}${disabled ? " disabled" : ""}`}>
    {label && <span className="styled-dropdown-label">{label}{onEdit && <button type="button" className="searchable-dropdown-edit" aria-label={`${label} ekle veya düzenle`} title={`${label} ekle veya düzenle`} onClick={() => { inputRef.current?.focus(); onEdit(); }}><Pencil size={11} /></button>}</span>}
    <input type="hidden" name={name} value={value} />
    <div className="searchable-dropdown-value"><input ref={inputRef} className="searchable-dropdown-input" aria-label={label} value={selectedLabel} readOnly disabled={disabled} placeholder={placeholder} autoComplete="off" onFocus={() => { if (!disabled) setOpen(true); }} onClick={() => { if (!disabled) setOpen(true); }} /></div>
    <button type="button" className="searchable-dropdown-chevron" tabIndex={-1} aria-label={`${label} seçenekleri`} disabled={disabled} onClick={() => setOpen((current) => !current)}><ChevronDown size={15} /></button>
    {open && <div className="styled-dropdown-menu searchable-dropdown-menu" role="listbox">{options.map((item) => <button type="button" role="option" aria-selected={item.value === value} key={item.value} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(item.value); setOpen(false); }}>{optionContent(item)}</button>)}</div>}
  </div>;
}
