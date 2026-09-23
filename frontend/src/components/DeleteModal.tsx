import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function DeleteModal({ title, children, pending, onClose, onConfirm, error }: { title: string; children: ReactNode; pending: boolean; onClose: () => void; onConfirm: () => void; error?: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return createPortal(<div className="confirm-backdrop" role="presentation"><div ref={panel} className="confirm-modal" role="dialog" aria-modal="true" aria-label={title} onKeyDown={event => {
    if (event.key === 'Escape' && !pending) close.current();
    if (event.key === 'Tab') {
      const buttons = [...(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <button className="confirm-close" type="button" aria-label="Kapat" disabled={pending} onClick={onClose}>×</button>
    <h2>{title}</h2><div>{children}</div>{error}
    <div className="confirm-actions"><button className="button secondary" type="button" disabled={pending} onClick={onClose}>Vazgeç</button><button className="button danger" type="button" disabled={pending} onClick={onConfirm}>{pending ? 'Siliniyor…' : 'Sil'}</button></div>
  </div></div>, document.body);
}
