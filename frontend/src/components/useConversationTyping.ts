import { useCallback, useEffect, useRef, useState } from 'react';

type Writer = { userId: string; name: string; expiresAt: number };
export function useConversationTyping(conversationId: string | undefined, enabled: boolean) {
  const [people, setPeople] = useState<Writer[]>([]);
  const lastSent = useRef(0);
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const emit = useCallback((active: boolean) => {
    window.dispatchEvent(new CustomEvent('typing:send', { detail: { conversationId, active } }));
  }, [conversationId]);
  const stop = useCallback(() => { clearTimeout(idle.current); lastSent.current = 0; emit(false); }, [emit]);
  useEffect(() => {
    setPeople([]);
    if (!conversationId) return;
    const watch = () => window.dispatchEvent(new CustomEvent('typing:watch', { detail: conversationId }));
    const receive = (event: Event) => {
      const data = (event as CustomEvent<{ conversationId: string; people: Writer[] }>).detail;
      if (data.conversationId === conversationId) setPeople(data.people);
    };
    const reset = () => setPeople([]);
    const hidden = () => { if (document.visibilityState !== 'visible') stop(); };
    window.addEventListener('typing:received', receive);
    window.addEventListener('typing:connected', watch);
    window.addEventListener('typing:disconnected', reset);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', hidden);
    const expire = setInterval(() => setPeople(current => current.filter(person => person.expiresAt > Date.now())), 1000);
    watch();
    return () => {
      stop();
      window.dispatchEvent(new CustomEvent('typing:watch', { detail: null }));
      window.removeEventListener('typing:received', receive);
      window.removeEventListener('typing:connected', watch);
      window.removeEventListener('typing:disconnected', reset);
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', hidden);
      clearInterval(expire);
    };
  }, [conversationId, stop]);
  useEffect(() => { if (!enabled) stop(); }, [enabled, stop]);
  const typing = useCallback((text: string) => {
    if (!enabled || !text.trim() || document.visibilityState !== 'visible') { stop(); return; }
    if (Date.now() - lastSent.current >= 1500) { emit(true); lastSent.current = Date.now(); }
    clearTimeout(idle.current);
    idle.current = setTimeout(stop, 3000);
  }, [enabled, emit, stop]);
  return { people, typing, stop };
}
