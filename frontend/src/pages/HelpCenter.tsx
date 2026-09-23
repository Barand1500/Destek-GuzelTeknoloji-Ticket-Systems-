import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { api } from "../services/api";
import { useAuth } from "../features/auth/Auth";
import { roleHome, workspacePath } from "../router/paths";
export type PublicSettings = {
  supportEmail: string;
};
export function usePublicSettings() {
  return useQuery({
    queryKey: ["/public/settings"],
    queryFn: async () =>
      (await api.get("/public/settings")).data.data as PublicSettings,
  });
}
export function HelpCenter() {
  const { user, loading } = useAuth();
  const settings = usePublicSettings();
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Link className="brand" to="/">
          <img src="/images/brand-mark.png" alt="" />
          destek<span className="brand-dot">.</span>
        </Link>
        <div>
          <span className="eyebrow">
            DESTEK MERKEZİ
          </span>
          <h1>
            Size nasıl
            <br />
            yardımcı olabiliriz?
          </h1>
          <p>
            Sorularınızı destek ekibimize iletin.
            <br />
            Yanıtları ve talebinizin durumunu tek bir yerden takip edin.
          </p>
        </div>
        <div className="auth-caption">
          <ShieldCheck size={18} /> Size özel, güvenli destek alanı.
        </div>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-form">
          <MessageSquare size={32} aria-hidden="true" />
          <span className="eyebrow">HELP CENTER</span>
          <h2>Birlikte çözüme ulaşalım</h2>
          <p>
            Hesabınızla destek talebi oluşturabilir, dosya paylaşabilir ve
            geçmiş konuşmalarınıza ulaşabilirsiniz.
          </p>
          {loading ? (
            <p role="status">Oturum kontrol ediliyor…</p>
          ) : user ? (
            <>
              <Link
                className="button primary"
                to={
                  user.role === "CUSTOMER"
                    ? workspacePath(user.role, "tickets/new")
                    : roleHome(user.role)
                }
              >
                {user.role === "CUSTOMER" ? "Destek al" : "Çalışma alanına git"}
                <ArrowRight size={17} />
              </Link>
              {user.role === "CUSTOMER" && (
                <Link className="button" to={roleHome(user.role)}>
                  Müşteri portalına git
                </Link>
              )}
            </>
          ) : (
            <>
              <Link className="button primary" to="/auth">
                Destek almak için giriş yap
                <ArrowRight size={17} />
              </Link>
              <Link className="button" to="/register">
                Yeni hesap oluştur
              </Link>
            </>
          )}
          {settings.isError && (
            <p className="error" role="alert">
              Destek bilgileri yüklenemedi.{" "}
              <button type="button" onClick={() => void settings.refetch()}>
                Tekrar dene
              </button>
            </p>
          )}
          {settings.data?.supportEmail && (
            <p>
              İletişim:{" "}
              <a href={`mailto:${settings.data.supportEmail}`}>
                {settings.data.supportEmail}
              </a>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
