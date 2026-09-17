import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { Link, Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Headphones, ArrowRight, ShieldCheck } from "lucide-react";
import { api, errorText, setToken } from "../../services/api";
import type { User } from "../../types";
type AuthState = {
  user: User | null;
  loading: boolean;
  accept: (data: { user: User; accessToken: string }) => void;
  logout: () => Promise<void>;
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
    <AuthContext.Provider value={{ user, loading, accept, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}
export function AuthPage({ register = false }: { register?: boolean }) {
  const { user, loading, accept } = useAuth();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  if (loading)
    return <div className="loading-screen">Oturum kontrol ediliyor…</div>;
  if (user) return <Navigate to="/tickets" replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api.post(
        `/auth/${register ? "register" : "login"}`,
        {
          email: form.get("email"),
          password: form.get("password"),
          ...(register ? { name: form.get("name") } : {}),
        },
      );
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
        <div className="brand">
          <Headphones /> destek<span className="brand-dot">.</span>
        </div>
        <div>
          <span className="eyebrow">DAHA İYİ BİR DESTEK DENEYİMİ</span>
          <h1>
            Her talep,
            <br />
            bir çözümün
            <br />
            başlangıcı.
          </h1>
          <p>
            Sorularınız, konuşmalarınız ve çözümleriniz.
            <br />
            Hepsi tek bir yerde.
          </p>
        </div>
        <div className="auth-caption">
          <ShieldCheck size={18} /> Ekibinizle güvenli ve düzenli iletişim.
        </div>
      </section>
      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <span className="eyebrow">DESTEK MERKEZİ</span>
          <h2>{register ? "Hesabınızı oluşturun" : "Tekrar hoş geldiniz"}</h2>
          <p>
            {register
              ? "Destek taleplerinizi takip etmeye başlayın."
              : "Destek alanınıza devam etmek için giriş yapın."}
          </p>
          {register && (
            <label>
              Ad soyad
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
                placeholder="Adınız Soyadınız"
              />
            </label>
          )}
          <label>
            E-posta adresi
            <input
              name="email"
              required
              type="email"
              autoComplete="email"
              placeholder="siz@sirket.com"
            />
          </label>
          <label>
            Şifre
            <input
              name="password"
              required
              type="password"
              minLength={register ? 10 : 1}
              maxLength={72}
              autoComplete={register ? "new-password" : "current-password"}
              placeholder={register ? "En az 10 karakter" : "Şifrenizi girin"}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={pending}>
            {pending
              ? "Lütfen bekleyin…"
              : register
                ? "Hesap oluştur"
                : "Giriş yap"}
            <ArrowRight size={17} />
          </button>
          <p className="auth-switch">
            {register ? "Zaten hesabınız var mı?" : "Henüz hesabınız yok mu?"}{" "}
            <Link to={register ? "/login" : "/register"}>
              {register ? "Giriş yapın" : "Kayıt olun"}
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}
