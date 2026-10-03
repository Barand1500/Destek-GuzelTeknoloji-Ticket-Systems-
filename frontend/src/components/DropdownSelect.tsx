import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type DropdownOption = { value: string; label: string; presence?: "ONLINE" | "IDLE" | "OFFLINE" };
const presenceLabels = { ONLINE: "Çevrim içi", IDLE: "Boşta", OFFLINE: "Çevrim dışı" } as const;
export function DropdownSelect({ label, value, options, onChange, ariaLabel }: { label?: string; value: string; options: DropdownOption[]; onChange: (value: string) => void; ariaLabel: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const currentOption = options.find(option => option.value === value) ?? options[0];
  const optionContent = (option: DropdownOption) => <>{option.label}{option.presence && <span className={`presence-option-status presence-${option.presence}`}><i />{presenceLabels[option.presence]}</span>}</>;
  return <div ref={ref} className={`styled-dropdown${open ? " open" : ""}`}>
    {label && <span className="styled-dropdown-label">{label}</span>}
    <button type="button" className="styled-dropdown-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(value => !value)}><span>{currentOption ? optionContent(currentOption) : "Seçin"}</span><ChevronDown size={15} /></button>
    {open && <div className="styled-dropdown-menu" role="listbox">{options.map(option => <button type="button" role="option" aria-selected={option.value === value} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}>{optionContent(option)}</button>)}</div>}
  </div>;
}

export function MultiDropdownSelect({ label, value, options, onChange, ariaLabel, emptyLabel = "Etiket seçin", selectionSuffix = "etiket", className = "", selectionLabel = "Seçili kişiler", showVisibleToggle = false }: { label?: string; value: string[]; options: Array<{ value: string; label: string }>; onChange: (value: string[]) => void; ariaLabel: string; emptyLabel?: string; selectionSuffix?: string; className?: string; selectionLabel?: string; showVisibleToggle?: boolean }) {
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
    ? emptyLabel
    : selectionLabel;
  const filteredOptions = options.filter((option) =>
    option.label.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')),
  );
  const allVisibleSelected = filteredOptions.length > 0 && filteredOptions.every((option) => value.includes(option.value));
  const toggleVisible = () => {
    const visibleIds = filteredOptions.map((option) => option.value);
    onChange(
      allVisibleSelected
        ? value.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...value, ...visibleIds])),
    );
  };
  return <div ref={ref} className={`styled-dropdown${open ? " open" : ""}${className ? ` ${className}` : ""}`}>
    {label && <span className="styled-dropdown-label">{label}</span>}
    <button type="button" className="styled-dropdown-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((currentOpen) => !currentOpen)}><span>{current}</span><ChevronDown size={15} /></button>
    {open && <div className="styled-dropdown-menu" role="listbox" aria-multiselectable="true"><input className="styled-dropdown-search" aria-label={`${ariaLabel} ara`} placeholder="Ara..." value={search} onChange={(event) => setSearch(event.target.value)} />{showVisibleToggle && <button type="button" className="styled-dropdown-visible-toggle" onClick={toggleVisible}>{allVisibleSelected ? "Seçimi kaldır" : "Görünenleri seç"}</button>}{filteredOptions.map((option) => {
      const checked = value.includes(option.value);
      return <button type="button" role="option" aria-selected={checked} key={option.value} onClick={() => onChange(checked ? value.filter((id) => id !== option.value) : [...value, option.value])}><span className={`styled-dropdown-check${checked ? " checked" : ""}`}>{checked ? "✓" : ""}</span>{option.label}</button>;
    })}</div>}
  </div>;
}
