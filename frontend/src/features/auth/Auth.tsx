import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { api, errorText, setToken } from "../../services/api";
import type { User } from "../../types";
import { roleHome } from "../../router/paths";
import { EmailInput } from "../../components/EmailInput";
type AuthState = {
  user: User | null;
  loading: boolean;
  accept: (data: { user: User; accessToken: string }) => void;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
};
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  function accept(data: { user: User; accessToken: string }) {
    queryClient.clear();
    setToken(data.accessToken);
    setUser(data.user);
  }
  useEffect(() => {
    let active = true;
    api
      .post("/auth/refresh")
      .then((r) => {
        if (active) {
          setToken(r.data.data.accessToken);
          setUser(r.data.data.user);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    const expire = () => {
      queryClient.clear();
      setUser(null);
    };
    window.addEventListener("session-expired", expire);
    return () => {
      active = false;
      window.removeEventListener("session-expired", expire);
    };
  }, [queryClient]);
  async function logout() {
    await api.post("/auth/logout");
    setToken(null);
    setUser(null);
    queryClient.clear();
  }
  return (
    <AuthContext.Provider
      value={{ user, loading, accept, logout, updateUser: setUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}
export function AuthPage() {
  const { user, loading, accept } = useAuth();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  if (loading) return <div className="loading-screen">Oturum kontrol ediliyor…</div>;
  if (user) return <Navigate to={roleHome(user.role)} replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api.post("/auth/login", { email: form.get("email"), password: form.get("password") });
      accept(result.data.data);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <div className="brand"><img src="/images/brand-mark.png" alt="" /> destek<span className="brand-dot">.</span></div>
        <div>
          <span className="eyebrow">DAHA İYİ BİR DESTEK DENEYİMİ</span>
          <h1>Her talep,<br />bir çözümün<br />başlangıcı.</h1>
          <p>Sorularınız, konuşmalarınız ve çözümleriniz.<br />Hepsi tek bir yerde.</p>
        </div>
        <div className="auth-support-photo" aria-hidden="true">
          <img src="/images/support-agent.png" alt="" />
        </div>
        <div className="auth-caption"><ShieldCheck size={18} /> Ekibinizle güvenli ve düzenli iletişim.</div>
      </section>
      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <h2>Tekrar hoş geldiniz</h2>
          <label><span className="field-label">E-posta adresi</span><EmailInput name="email" required /></label>
          <label><span className="field-label">Şifre</span><span className="password-field"><input name="password" required type={showPassword ? "text" : "password"} minLength={1} maxLength={72} autoComplete="current-password" /><button className="password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="button primary" disabled={pending}>{pending ? "Lütfen bekleyin…" : "Giriş yap"}<ArrowRight size={17} /></button>
        </form>
      </section>
    </main>
  );
}
