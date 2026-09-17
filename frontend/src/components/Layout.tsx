import { useState } from "react";
import { NavLink, Outlet, Navigate } from "react-router-dom";
import {
  Headphones,
  Inbox,
  LayoutDashboard,
  LogOut,
  Plus,
  Building2,
} from "lucide-react";
import { useAuth } from "../features/auth/Auth";
import { errorText } from "../services/api";
import { roles } from "../types";
export function Layout() {
  const { user, loading, logout } = useAuth();
  const [error, setError] = useState("");
  if (loading)
    return <div className="loading-screen">Oturum kontrol ediliyor…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Headphones /> destek<span className="brand-dot">.</span>
        </div>
        <div className="workspace">
          <span className="workspace-icon">
            <Building2 size={18} />
          </span>
          <div>
            Destek Merkezi<small>Çalışma alanınız</small>
          </div>
          <span className="online-dot" />
        </div>
        <span className="nav-label">ÇALIŞMA ALANI</span>
        <nav>
          <NavLink to="/dashboard">
            <LayoutDashboard size={19} />
            Genel bakış
          </NavLink>
          <NavLink to="/tickets">
            <Inbox size={19} />
            {user.role === "CUSTOMER" ? "Taleplerim" : "Gelen kutusu"}
          </NavLink>
          {user.role === "CUSTOMER" && (
            <NavLink to="/new">
              <Plus size={19} />
              Yeni talep
            </NavLink>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <span>Birlikte çözüme.</span>
            <p>Her konuşma, daha iyi bir deneyim için bir fırsat.</p>
          </div>
          <div className="profile">
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <div>
              {user.name}
              <small>{roles[user.role]}</small>
            </div>
            <button
              className="icon-button"
              title="Çıkış yap"
              aria-label="Çıkış yap"
              onClick={() => logout().catch((e) => setError(errorText(e)))}
            >
              <LogOut size={18} />
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Çalışma alanı <span className="slash">/</span> Destek merkezi
          </span>
          <span className="topbar-user">
            <span className="online-dot" /> {roles[user.role]}
          </span>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
