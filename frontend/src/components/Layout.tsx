import { useEffect, useState } from "react";
import { NavLink, Outlet, Navigate } from "react-router-dom";
import {
  Inbox,
  LayoutDashboard,
  LogOut,
  Plus,
  Building2,
  Users,
  Tags,
  Bell,
  UserRound,
  FileText,
  Settings,
  History,
  ChevronDown,
  X,
  CheckCheck,
  Moon,
  Sun,
  Search,
  Timer,
  Mail,
} from "lucide-react";
import { useAuth } from "../features/auth/Auth";
import { conversationPath, inboxPath, workspacePath } from "../router/paths";
import { errorText } from "../services/api";
import { roles } from "../types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../services/api";
export function Layout() {
  const { user, loading, logout } = useAuth();
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => window.localStorage.getItem("helpdesk-theme") === "dark" ? "dark" : "light");
  const [globalSearch, setGlobalSearch] = useState("");
  const [quickSlots, setQuickSlots] = useState<Array<{ label: string; href: string } | null>>([null, null, null, null]);
  const [quickSlotsReady, setQuickSlotsReady] = useState(false);
  useEffect(() => {
    if (!user) return;
    const storageKey = `helpdesk-quick-access-${user.id}`;
    try {
      const saved = window.localStorage.getItem(storageKey);
      const parsed = saved ? JSON.parse(saved) : null;
      setQuickSlots(Array.isArray(parsed) && parsed.length === 4 ? parsed : [null, null, null, null]);
    } catch {
      setQuickSlots([null, null, null, null]);
    }
    setQuickSlotsReady(true);
  }, [user?.id]);
  useEffect(() => {
    if (!user || !quickSlotsReady) return;
    try {
      window.localStorage.setItem(`helpdesk-quick-access-${user.id}`, JSON.stringify(quickSlots));
    } catch {
      // Storage can be unavailable in private browsing; shortcuts remain available for this session.
    }
  }, [quickSlots, quickSlotsReady, user]);
  const customerSearch = useQuery({
    queryKey: ["/customers", "global", globalSearch],
    queryFn: async () => (await api.get<{ data: Array<{ id: string; name: string; email?: string | null; phone?: string | null }> }>("/customers", { params: { search: globalSearch, limit: 6 } })).data.data,
    enabled: user?.role !== "CUSTOMER" && globalSearch.trim().length >= 2,
  });
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ["/notifications", "unread"],
    queryFn: async () =>
      (
        await api.get("/notifications", {
          params: { limit: 8, isRead: "false" },
        })
      ).data as { data: Array<{ id: string; title: string; message: string; createdAt: string; isRead: boolean; conversationId?: string | null }>; unreadCount: number; pagination: { total: number } },
    enabled: !!user,
    refetchInterval: 15_000,
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("helpdesk-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!notificationsOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest(".notification-trigger")) setNotificationsOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [notificationsOpen]);
  const markNotificationRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["/notifications"] }),
  });
  const clearNotifications = useMutation({
    mutationFn: () => api.patch("/notifications/read-all"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/notifications"] });
    },
  });
  if (loading)
    return <div className="loading-screen">Oturum kontrol ediliyor…</div>;
  if (!user) return <Navigate to="/auth" replace />;
  const path = (suffix: string) => workspacePath(user.role, suffix);
  const searchItems = [
    { label: "Genel bakış", group: "Sayfalar", to: path("dashboard") },
    { label: user.role === "CUSTOMER" ? "Taleplerim" : "Gelen kutusu", group: "Sayfalar", to: inboxPath(user.role) },
    ...(user.role !== "CUSTOMER" ? [
      { label: "Müşteriler", group: "Sayfalar", to: path("customers") },
      { label: "Telefon talebi", group: "Sayfalar", to: path("phone-support") },
    ] : []),
    ...(user.role === "ADMIN" ? [
      { label: "Entegrasyonlar", group: "Yönetim", to: path("integrations") },
      { label: "Personeller", group: "Yönetim", to: path("users") },
      { label: "Kategoriler", group: "Yönetim", to: path("tags") },
      { label: "Web siteleri", group: "Yönetim", to: path("websites") },
    ] : []),
  ].filter((item) => item.label.toLocaleLowerCase("tr-TR").includes(globalSearch.toLocaleLowerCase("tr-TR")));
  const workspaceName =
    user.role === "CUSTOMER"
      ? "Müşteri portalı"
      : user.role === "ADMIN"
        ? "Yönetim paneli"
        : "Destek çalışma alanı";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/images/brand-mark.png" alt="" /> destek<span className="brand-dot">.</span>
        </div>
        <span className="nav-label">ÇALIŞMA ALANI</span>
        <nav onDragStart={(event) => {
          const link = (event.target as HTMLElement).closest("a");
          if (link) event.dataTransfer?.setData("text/plain", JSON.stringify({ label: link.textContent?.trim(), href: link.getAttribute("href") }));
        }}>
          <NavLink to={path("dashboard")}>
            <LayoutDashboard size={19} />
            Genel bakış
          </NavLink>
          <NavLink to={inboxPath(user.role)} end>
            <Inbox size={19} />
            {user.role === "CUSTOMER" ? "Taleplerim" : "Gelen kutusu"}
          </NavLink>
          {user.role === "CUSTOMER" && (
            <NavLink to={path("tickets/new")}>
              <Plus size={19} />
              Yeni talep
            </NavLink>
          )}
          {user.role !== "CUSTOMER" && (
            <>
              <NavLink to={path("customers")}>
                <Users size={19} />
                Müşteriler
              </NavLink>
              <NavLink to={path("phone-support")}>
                <Plus size={19} />
                Telefon talebi
              </NavLink>
            </>
          )}
          {user.role === "ADMIN" && (
            <>
              <button
                className={`settings-nav-toggle${settingsOpen ? " open" : ""}`}
                type="button"
                aria-expanded={settingsOpen}
                aria-controls="admin-settings-nav"
                onClick={() => setSettingsOpen((open) => !open)}
              >
                <Settings size={19} />
                Ayarlar
                <ChevronDown size={16} />
              </button>
              {settingsOpen && (
                <div className="settings-nav-links" id="admin-settings-nav">
                  <NavLink to={path("integrations")}><Settings size={16} />Entegrasyonlar</NavLink>
                  <NavLink to={path("response-time-rules")}><Timer size={16} />Yanıt süreleri</NavLink>
                  <NavLink to={path("notification-settings")}><Mail size={16} />E-posta bildirimleri</NavLink>
                  <NavLink to={path("users")}><Users size={16} />Personeller</NavLink>
                  <NavLink to={path("tags")}><Tags size={16} />Kategoriler</NavLink>
                  <NavLink to={path("websites")}><Tags size={16} />Web siteleri</NavLink>
                </div>
              )}
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          {user.role === "ADMIN" && (
            <div className="sidebar-tools" aria-label="Yönetim araçları">
              <NavLink to={path("saved-replies")} className="sidebar-tool" aria-label="Hazır yanıtlar" title="Hazır yanıtlar"><FileText size={17} /></NavLink>
              <NavLink to={path("activity-logs")} className="sidebar-tool" aria-label="İşlem geçmişi" title="İşlem geçmişi"><History size={17} /></NavLink>
            </div>
          )}
          <div className="sidebar-help">
            <span>Birlikte çözüme.</span>
            <p>Her konuşma, daha iyi bir deneyim için bir fırsat.</p>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="global-search-wrap">
            <Search size={16} aria-hidden="true" />
            <input
              className="global-search"
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
              placeholder="Ara…"
              aria-label="Genel arama"
            />
            {globalSearch && (
              <div className="global-search-results">
                {searchItems.map((item) => (
                  <NavLink key={`${item.group}-${item.to}`} to={item.to} onClick={() => setGlobalSearch("")}><small>{item.group}</small><span>{item.label}</span></NavLink>
                ))}
                {!!customerSearch.data?.length && customerSearch.data.map((customer) => (
                  <NavLink key={customer.id} to={path(`customers?customer=${customer.id}`)} onClick={() => setGlobalSearch("")}><small>Müşteriler</small><span>{customer.name} · {customer.phone || customer.email || "İletişim bilgisi yok"}</span></NavLink>
                ))}
                {!searchItems.length && !customerSearch.data?.length && <p>{customerSearch.isFetching ? "Aranıyor…" : "Sonuç bulunamadı."}</p>}
              </div>
            )}
          </div>
          <div className="quick-actions" aria-label="Hızlı erişim">
            {quickSlots.map((slot, index) => slot ? <NavLink key={index} to={slot.href} className="quick-action" title={`${slot.label} — kaldırmak için sağ tıklayın`} onContextMenu={(event) => { event.preventDefault(); setQuickSlots((slots) => slots.map((value, i) => i === index ? null : value)); }}>{index === 0 ? <Inbox size={16} /> : index === 1 ? <Users size={16} /> : index === 2 ? <Plus size={16} /> : <Settings size={16} />}</NavLink> : <button key={index} className="quick-action quick-slot" type="button" title="Sol menüden sürükleyip buraya bırak" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); try { const item = JSON.parse(event.dataTransfer.getData("text/plain")); if (item.href) setQuickSlots((slots) => slots.map((value, i) => i === index ? item : value)); } catch { /* ignore invalid drops */ } }}>+</button>)}
          </div>
          <div className="topbar-actions">
            <button className="topbar-icon-link theme-toggle" type="button" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Gündüz moduna geç" : "Gece moduna geç"} title={theme === "dark" ? "Gündüz modu" : "Gece modu"}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
            <div className="notification-trigger">
            <button
              className="topbar-icon-link"
              type="button"
              onClick={() => setNotificationsOpen((open) => !open)}
              aria-label="Bildirimler"
              title="Bildirimler"
            >
              <Bell size={19} />
              {notifications.data?.unreadCount ? (
                <span className="notification-count">
                  {notifications.data.unreadCount > 99
                    ? "99+"
                    : notifications.data.unreadCount}
                </span>
              ) : null}
            </button>
          {notificationsOpen && (
            <div className="notification-popover" role="dialog" aria-label="Bildirimler">
              <div className="notification-popover-header">
                <strong>Bildirimler</strong>
                <span>{notifications.data?.unreadCount ?? 0}</span>
                <span className="notification-popover-header-actions">
                  <button type="button" className="notification-clear" onClick={() => clearNotifications.mutate()} disabled={clearNotifications.isPending || !notifications.data?.data.length} aria-label="Tümünü okundu işaretle" title="Tümünü okundu işaretle"><CheckCheck size={15} /></button>
                  <button type="button" className="notification-close" onClick={() => setNotificationsOpen(false)} aria-label="Bildirimleri kapat"><X size={17} /></button>
                </span>
              </div>
              <div className="notification-popover-list">
                {notifications.data?.data.length ? notifications.data.data.map((notification) => (
                  <NavLink key={notification.id} to={notification.conversationId ? conversationPath(user.role, notification.conversationId) : path("notifications")} className="notification-popover-item unread" onClick={() => { markNotificationRead.mutate(notification.id); setNotificationsOpen(false); }}>
                    <span className="notification-popover-icon"><Bell size={15} /></span>
                    <span><strong>{notification.title}</strong><small>{notification.message}</small></span>
                    <time>{new Date(notification.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</time>
                  </NavLink>
                )) : <p className="notification-popover-empty">Yeni bildiriminiz yok.</p>}
              </div>
              <div className="notification-popover-footer">
                <NavLink to={path("notifications")} onClick={() => setNotificationsOpen(false)}>Bildirimlere git</NavLink>
              </div>
            </div>
          )}
          </div>
            <NavLink
              className="topbar-profile-link"
              to={path("profile")}
              aria-label="Profilim"
              title="Profilim"
            >
              <span className="avatar">{user.name.slice(0, 1)}</span>
              <span className="topbar-profile-name">{user.name}</span>
              <UserRound size={16} />
            </NavLink>
            <button className="topbar-icon-link" type="button" title="Çıkış yap" aria-label="Çıkış yap" onClick={() => logout().catch((e) => setError(errorText(e)))}><LogOut size={17} /></button>
          </div>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
