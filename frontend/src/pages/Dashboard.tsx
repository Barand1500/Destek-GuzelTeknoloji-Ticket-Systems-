import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Inbox, Clock3, CheckCheck, CircleDot } from "lucide-react";
import { api } from "../services/api";
import { useAuth } from "../features/auth/Auth";
import { QueryError } from "../features/tickets/Tickets";
import { statuses, type Status } from "../types";
import { inboxPath, workspacePath } from "../router/paths";
import { hasPermission } from "../features/auth/permissions";

const chartColors: Record<Status, string> = {
  OPEN: "#398571",
  PENDING: "#d8a142",
  IN_PROGRESS: "#4f86c6",
  RESOLVED: "#7c9f64",
  CLOSED: "#89968e",
};

export function Dashboard() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["dashboard"],
    refetchInterval: user?.role === 'CUSTOMER' ? false : 15_000,
    queryFn: async () =>
      (await api.get("/dashboard")).data.data as {
        total: number;
        unassigned: number;
        conversationsToday: number;
        activeAgents?: number;
        statuses: Partial<Record<Status, number>>;
      },
  });
  const statusEntries = (Object.keys(statuses) as Status[]).map((key) => ({
    key,
    label: statuses[key],
    value: query.data?.statuses[key] ?? 0,
    color: chartColors[key],
  }));
  const chartTotal = Math.max(1, statusEntries.reduce((sum, entry) => sum + entry.value, 0));
  let progress = 0;
  const slices = statusEntries.map((entry) => {
    const start = progress;
    progress += (entry.value / chartTotal) * 100;
    return `${entry.color} ${start}% ${progress}%`;
  });
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">GENEL BAKIŞ</span>
          <h1>Merhaba, {user?.name.split(" ")[0]}.</h1>
          <p>Taleplerinizi, bekleyen işleri ve ekip durumunu tek ekranda izleyin.</p>
        </div>
        <Link className="button primary" to={inboxPath(user!.role)}>
          Taleplere git
          <ArrowRight size={16} />
        </Link>
      </div>
      {query.isError ? <QueryError error={query.error} /> : <>
        <div className="stat-grid">
          {[
            { label: "Toplam talep", value: query.data?.total, icon: Inbox, to: inboxPath(user!.role), permission: 'conversations.view' },
            { label: "Açık talepler", value: query.data?.statuses.OPEN, icon: CircleDot, to: `${inboxPath(user!.role)}?status=OPEN`, permission: 'conversations.view' },
            { label: "Bekleyen talepler", value: query.data?.statuses.PENDING, icon: Clock3, to: `${inboxPath(user!.role)}?status=PENDING`, permission: 'conversations.view' },
            { label: "Çözülen talepler", value: query.data?.statuses.RESOLVED, icon: CheckCheck, to: `${inboxPath(user!.role)}?status=RESOLVED`, permission: 'conversations.view' },
            { label: "Bugün açılanlar", value: query.data?.conversationsToday, icon: Inbox, to: `${inboxPath(user!.role)}?view=today`, permission: 'conversations.view' },
            { label: "Kapalı talepler", value: query.data?.statuses.CLOSED, icon: CheckCheck, to: `${inboxPath(user!.role)}?status=CLOSED`, permission: 'conversations.view' },
            ...(user?.role === "CUSTOMER" ? [] : [
              { label: "Atanmamış talepler", value: query.data?.unassigned, icon: CircleDot, to: `${inboxPath(user!.role)}?view=unassigned`, permission: 'conversations.view' },
              { label: "Aktif personel", value: query.data?.activeAgents, icon: CircleDot, to: workspacePath(user!.role, 'staff-presence'), permission: 'presence.view' },
            ]),
          ].map((stat) => {
            const content = <>
              <div>{stat.label}<stat.icon size={19} /></div>
              <strong>{query.isPending ? "—" : (stat.value ?? 0)}</strong>
              <small>{stat.permission === 'presence.view' ? 'Şu anda çevrimiçi personel' : 'Erişebildiğiniz talepler'}</small>
            </>;
            return hasPermission(user, stat.permission)
              ? <Link className="stat-card stat-card-link" key={stat.label} to={stat.to}>{content}</Link>
              : <div className="stat-card" key={stat.label}>{content}</div>;
          })}
        </div>
        <section className="dashboard-card status-chart-card">
          <div>
            <span className="eyebrow">TALEP DURUMLARI</span>
            <h2>Her adımda kontrol sizde.</h2>
            <p>Açılıştan çözüme kadar tüm taleplerinizi takip edin.</p>
          </div>
          <div className="status-chart-wrap">
            <div className="status-pie" style={{ background: `conic-gradient(${slices.join(", ")})` }} aria-label="Talep durumları pasta grafiği">
              <strong>{query.isPending ? "—" : query.data?.total ?? 0}</strong>
              <span>Toplam talep</span>
            </div>
            <div className="status-chart-legend">
              {statusEntries.map((entry) => <Link key={entry.key} to={`${inboxPath(user!.role)}?status=${entry.key}`}>
                <span><i style={{ backgroundColor: entry.color }} />{entry.label}</span><strong>{entry.value}</strong>
              </Link>)}
            </div>
          </div>
        </section>
      </>}
    </main>
  );
}
