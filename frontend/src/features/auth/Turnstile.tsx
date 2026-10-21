import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';

type Action = 'login' | 'register' | 'forgot_password' | 'form_submit' | 'form_access';
type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }
let scriptPromise: Promise<TurnstileApi> | undefined;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => { clearTimeout(timeout); script.remove(); scriptPromise = undefined; reject(new Error('Turnstile script unavailable')); };
    const timeout = setTimeout(fail, 15000);
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => { clearTimeout(timeout); if (window.turnstile) resolve(window.turnstile); else fail(); };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function useTurnstile(action: Action) {
  const [token, setToken] = useState('');
  const [version, setVersion] = useState(0);
  const settings = useQuery({
    queryKey: ['auth-security'],
    queryFn: async () => {
      const data = (await api.get('/auth/security')).data.data as { enabled: boolean; siteKey: string | null };
      if (typeof data?.enabled !== 'boolean' || (data.enabled && !data.siteKey)) throw new Error('Invalid auth security settings');
      return data;
    },
    staleTime: 0, refetchInterval: 30_000, refetchOnWindowFocus: 'always', retry: 1,
  });
  const reset = useCallback(() => { setToken(''); setVersion(value => value + 1); }, []);
  return { action, settings, token, setToken, version, reset,
    ready: settings.isSuccess && (!settings.data.enabled || Boolean(token)),
    payload: settings.data?.enabled ? { turnstileToken: token } : {},
  };
}

function Widget({ siteKey, action, onToken, onRetry, version }: { siteKey: string; action: Action; onToken: (value: string) => void; onRetry: () => void; version: number }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true, widgetId: string | undefined, api: TurnstileApi | undefined;
    onToken(''); setError('');
    void loadTurnstile().then(loaded => {
      if (!active || !container.current) return;
      api = loaded;
      widgetId = api.render(container.current, {
        sitekey: siteKey, action, theme, language: 'tr', size: 'flexible',
        'response-field': false,
        callback: (token: string) => { if (active) { setError(''); onToken(token); } },
        'expired-callback': () => { if (active) onToken(''); },
        'error-callback': () => { if (active) { onToken(''); setError('Güvenlik doğrulaması yapılamadı. Yeniden deneyin.'); } return true; },
        'timeout-callback': () => { if (active) { onToken(''); setError('Doğrulama süresi doldu. Yeniden deneyin.'); } },
        'refresh-expired': 'auto',
      });
    }).catch(() => { if (active) setError('Güvenlik doğrulaması yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.'); });
    return () => { active = false; if (api && widgetId !== undefined) api.remove(widgetId); };
  }, [siteKey, action, theme, version, onToken]);
  return <div className="auth-captcha"><div ref={container} aria-label="Güvenlik doğrulaması" />{error && <div><p className="error" role="alert">{error}</p><button className="auth-forgot" type="button" onClick={onRetry}>Yeniden Dene</button></div>}</div>;
}

export function TurnstileField({ captcha }: { captcha: ReturnType<typeof useTurnstile> }) {
  if (captcha.settings.isPending) return <p className="muted" role="status">Güvenlik doğrulaması hazırlanıyor…</p>;
  if (captcha.settings.isError) return <div><p className="error" role="alert">Güvenlik ayarları alınamadı. Yeniden deneyin.</p><button type="button" className="auth-forgot" onClick={() => void captcha.settings.refetch()}>Yeniden Dene</button></div>;
  if (!captcha.settings.data.enabled) return null;
  return <Widget siteKey={captcha.settings.data.siteKey!} action={captcha.action} version={captcha.version} onToken={captcha.setToken} onRetry={captcha.reset} />;
}
