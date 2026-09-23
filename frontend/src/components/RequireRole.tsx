import { Outlet, Link, Navigate } from "react-router-dom";
import { useAuth } from "../features/auth/Auth";
import { roleHome } from "../router/paths";
import type { Role } from "../types";
export function RequireRole({ roles }: { roles: Role[] }) {
  const { user, loading } = useAuth();
  if (loading)
    return <div className="loading-screen">Oturum kontrol ediliyor…</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (roles.includes(user.role)) return <Outlet />;
  return (
    <main className="page">
      <h1>Erişim yetkiniz yok</h1>
      <p>Bu ekran hesabınıza açık değil.</p>
      <Link className="button primary" to={roleHome(user.role)}>
        Çalışma alanına dön
      </Link>
    </main>
  );
}
