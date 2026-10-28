import { useEffect, useLayoutEffect, useRef } from 'react';

export function useComposerFocus(pending: boolean, conversationId?: string) {
  const formRef = useRef<HTMLFormElement>(null);
  const restore = useRef(false);
  useLayoutEffect(() => { restore.current = false; }, [conversationId]);
  useEffect(() => {
    const cancelOnOtherTarget = (event: Event) => {
      if (!restore.current || !(event.target instanceof Element) || event.target === document.body) return;
      if (!formRef.current?.contains(event.target) || !event.target.closest('textarea, .composer-send')) restore.current = false;
    };
    document.addEventListener('pointerdown', cancelOnOtherTarget, true);
    document.addEventListener('focusin', cancelOnOtherTarget, true);
    return () => {
      document.removeEventListener('pointerdown', cancelOnOtherTarget, true);
      document.removeEventListener('focusin', cancelOnOtherTarget, true);
    };
  }, []);
  useLayoutEffect(() => {
    if (pending || !restore.current) return;
    restore.current = false;
    const field = formRef.current?.querySelector<HTMLTextAreaElement>('textarea:not(:disabled)');
    if (field && field.getClientRects().length) field.focus({ preventScroll: true });
  }, [pending]);
  return { formRef, restoreAfterSend: () => { restore.current = true; } };
}
