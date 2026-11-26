import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type DropdownOption = { value: string; label: string; presence?: "ONLINE" | "IDLE" | "OFFLINE"; openConversationCount?: number };
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
  const optionContent = (option: DropdownOption) => <><span className="dropdown-option-label">{option.label}</span>{(option.presence || option.openConversationCount !== undefined) && <span className="dropdown-option-details">{option.openConversationCount !== undefined && <span className="assignee-open-count">{option.openConversationCount} açık talep</span>}{option.presence && <span className={`presence-option-status presence-${option.presence}`}><i />{presenceLabels[option.presence]}</span>}</span>}</>;
  return <div ref={ref} className={`styled-dropdown${open ? " open" : ""}`}>
    {label && <span className="styled-dropdown-label">{label}</span>}
    <button type="button" className="styled-dropdown-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(value => !value)}><span>{currentOption ? optionContent(currentOption) : "Seçin"}</span><ChevronDown size={15} /></button>
    {open && <div className="styled-dropdown-menu" role="listbox">{options.map(option => <button type="button" role="option" aria-selected={option.value === value} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}>{optionContent(option)}</button>)}</div>}
  </div>;
}

export function MultiDropdownSelect({ label, value, options, onChange, ariaLabel, emptyLabel = "Etiket seçin", selectionSuffix = "etiket", className = "", selectionLabel = "Seçili kişiler", showVisibleToggle = false, defaultOpen = false, disabled = false, preserveOrderWhileOpen = false, searchable = true }: { label?: string; value: string[]; options: DropdownOption[]; onChange: (value: string[]) => void; ariaLabel: string; emptyLabel?: string; selectionSuffix?: string; className?: string; selectionLabel?: string; showVisibleToggle?: boolean; defaultOpen?: boolean; disabled?: boolean; preserveOrderWhileOpen?: boolean; searchable?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const optionOrder = useRef(options.map(option => option.value));
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
  const orderedOptions = preserveOrderWhileOpen && open ? [...options].sort((a, b) => { const first = optionOrder.current.indexOf(a.value), second = optionOrder.current.indexOf(b.value); return (first < 0 ? Infinity : first) - (second < 0 ? Infinity : second); }) : options;
  const filteredOptions = orderedOptions.filter((option) =>
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
    <button type="button" className="styled-dropdown-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => { if (!open) optionOrder.current = options.map(option => option.value); setOpen(currentOpen => !currentOpen); }}><span>{current}</span><ChevronDown size={15} /></button>
    {open && <div className="styled-dropdown-menu" role="listbox" aria-multiselectable="true">{searchable && <input className="styled-dropdown-search" aria-label={`${ariaLabel} ara`} placeholder="Ara" value={search} onChange={(event) => setSearch(event.target.value)} />}{showVisibleToggle && <button type="button" className="styled-dropdown-visible-toggle" onClick={toggleVisible}>{allVisibleSelected ? "Seçimi Kaldır" : "Görünenleri Seç"}</button>}{filteredOptions.map((option) => {
      const checked = value.includes(option.value);
      return <button type="button" role="option" aria-selected={checked} key={option.value} disabled={disabled} onClick={() => onChange(checked ? value.filter((id) => id !== option.value) : [...value, option.value])}><span className={`styled-dropdown-check${checked ? " checked" : ""}`} aria-hidden="true">{checked ? "✓" : ""}</span><span className="dropdown-option-label" title={option.label}>{option.label}</span>{(option.presence || option.openConversationCount !== undefined) && <span className="dropdown-option-details">{option.openConversationCount !== undefined && <span className="assignee-open-count">{option.openConversationCount} açık talep</span>}{option.presence && <span className={`presence-option-status presence-${option.presence}`}><i />{presenceLabels[option.presence]}</span>}</span>}</button>;
    })}</div>}
  </div>;
}
