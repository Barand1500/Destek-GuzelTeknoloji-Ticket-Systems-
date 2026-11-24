import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Pencil } from "lucide-react";

type Option = { value: string; label: string; presence?: "ONLINE" | "IDLE" | "OFFLINE"; openConversationCount?: number };
const presenceLabels = { ONLINE: "Çevrim içi", IDLE: "Boşta", OFFLINE: "Çevrim dışı" } as const;

export function SearchableDropdown({ label, name, value, options, onChange, disabled = false, placeholder = "Seçin", onEdit, footer, optionAction, maxMenuHeight = 190, placement = "auto", onMenuEnd, searchable = false, searchPlaceholder = "Ara..." }: { label: string; name: string; value: string; options: Option[]; onChange: (value: string) => void; disabled?: boolean; placeholder?: string; onEdit?: () => void; footer?: ReactNode; optionAction?: (option: Option) => ReactNode; maxMenuHeight?: number; placement?: "auto" | "bottom"; onMenuEnd?: () => void; searchable?: boolean; searchPlaceholder?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuLayout, setMenuLayout] = useState({ above: false, height: maxMenuHeight, left: 0, top: 0, width: 0 });
  const selectedLabel = options.find((item) => item.value === value)?.label ?? '';
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const filteredOptions = searchable && query.trim()
    ? options.filter((item) => item.label.toLocaleLowerCase("tr-TR").includes(query.trim().toLocaleLowerCase("tr-TR")))
    : options;
  useEffect(() => {
    if (!open) setQuery("");
    else if (searchable) window.requestAnimationFrame(() => searchRef.current?.focus());
  }, [open, searchable]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const anchor = ref.current?.getBoundingClientRect(); if (!anchor) return;
      const body = placement === 'bottom' ? undefined : ref.current?.closest('.agreement-dialog-body')?.getBoundingClientRect();
      const top = Math.max(8, body ? body.top + 8 : 8), bottom = Math.min(window.innerHeight - 8, body ? body.bottom - 8 : window.innerHeight - 8);
      const aboveSpace = anchor.top - top - 8, belowSpace = bottom - anchor.bottom - 8;
      const above = placement === "auto" && belowSpace < maxMenuHeight && aboveSpace > belowSpace;
      const height = Math.max(40, Math.min(maxMenuHeight, Math.floor(above ? aboveSpace : belowSpace)));
      setMenuLayout(current => current.above === above && current.height === height && current.left === anchor.left && current.top === anchor.bottom + 6 && current.width === anchor.width ? current : { above, height, left: anchor.left, top: anchor.bottom + 6, width: anchor.width });
    };
    measure(); if (placement === "bottom") menuRef.current?.showPopover(); window.addEventListener('resize', measure); window.addEventListener('scroll', measure, true);
    return () => { if (placement === "bottom" && menuRef.current?.matches(":popover-open")) menuRef.current.hidePopover(); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [open, maxMenuHeight, options.length, placement]);
  const optionContent = (item: Option) => <><span className="dropdown-option-label">{item.label}</span>{(item.presence || item.openConversationCount !== undefined) && <span className="dropdown-option-details">{item.openConversationCount !== undefined && <span className="assignee-open-count">{item.openConversationCount} açık talep</span>}{item.presence && <span className={`presence-option-status presence-${item.presence}`}><i />{presenceLabels[item.presence]}</span>}</span>}</>;
  return <div ref={ref} onKeyDown={event => { if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); inputRef.current?.focus(); setOpen(false); } }} className={`styled-dropdown searchable-dropdown${open ? " open" : ""}${disabled ? " disabled" : ""}`}>
    {label && <span className="styled-dropdown-label">{label}{onEdit && <button type="button" className="searchable-dropdown-edit" aria-label={`${label} ekle veya düzenle`} title={`${label} ekle veya düzenle`} onClick={() => { inputRef.current?.focus(); onEdit(); }}><Pencil size={11} /></button>}</span>}
    <input type="hidden" name={name} value={value} />
    <div className="searchable-dropdown-value"><input ref={inputRef} className="searchable-dropdown-input" aria-label={label} value={selectedLabel} readOnly disabled={disabled} placeholder={placeholder} autoComplete="off" onFocus={() => { if (!disabled) setOpen(true); }} onClick={() => { if (!disabled) setOpen(true); }} /></div>
    <button type="button" className="searchable-dropdown-chevron" tabIndex={-1} aria-label={`${label} seçenekleri`} disabled={disabled} onClick={() => setOpen((current) => !current)}><ChevronDown size={15} /></button>
    {open && <div onScrollCapture={event => { const target = event.target as HTMLElement; if (target.scrollHeight - target.scrollTop - target.clientHeight < 32) onMenuEnd?.(); }} ref={menuRef} popover={placement === "bottom" ? "manual" : undefined} className="styled-dropdown-menu searchable-dropdown-menu" data-placement={menuLayout.above ? 'top' : 'bottom'} style={{ ...(placement === "bottom" && ref.current ? { position: "fixed", margin: 0, left: menuLayout.left, width: menuLayout.width, right: "auto", top: menuLayout.top, bottom: "auto" } : {}), maxHeight: menuLayout.height, ...(placement === 'bottom' ? {} : menuLayout.above ? { top: 'auto', bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)', bottom: 'auto' }) }}>{searchable && <div className="searchable-dropdown-search" style={{ padding: "8px 8px 6px", position: "sticky", top: 0, zIndex: 1, background: "inherit" }}><input ref={searchRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} style={{ width: "100%", height: 34, padding: "4px 10px", border: "1px solid var(--border, #dbe3e8)", borderRadius: 8, background: "transparent", color: "inherit", font: "inherit", fontSize: 13 }} /></div>}<div role="listbox" aria-label={label}>{filteredOptions.length ? filteredOptions.map((item) => {
      const button = <button type="button" role="option" aria-selected={item.value === value} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(item.value); setOpen(false); }}>{optionContent(item)}</button>;
      return optionAction ? <div className="searchable-dropdown-option-row" key={item.value}>{button}{optionAction(item)}</div> : <button type="button" role="option" aria-selected={item.value === value} key={item.value} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(item.value); setOpen(false); }}>{optionContent(item)}</button>;
    }) : <div style={{ padding: "10px 12px", fontSize: 13, color: "var(--ui-text-secondary)" }}>Sonuç bulunamadı</div>}</div>{footer && <div className="searchable-dropdown-footer">{footer}</div>}</div>}
  </div>;
}
