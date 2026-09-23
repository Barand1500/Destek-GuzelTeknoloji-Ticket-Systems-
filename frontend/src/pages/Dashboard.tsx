import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Inbox, Clock3, CheckCheck, CircleDot } from "lucide-react";
import { api } from "../services/api";
import { useAuth } from "../features/auth/Auth";
import { QueryError } from "../features/tickets/Tickets";
import { statuses, type Status } from "../types";
import { inboxPath } from "../router/paths";

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
            { label: "Toplam talep", value: query.data?.total, icon: Inbox },
            { label: "Açık talepler", value: query.data?.statuses.OPEN, icon: CircleDot },
            { label: "Bekleyen talepler", value: query.data?.statuses.PENDING, icon: Clock3 },
            { label: "Çözülen talepler", value: query.data?.statuses.RESOLVED, icon: CheckCheck },
            { label: "Bugün açılanlar", value: query.data?.conversationsToday, icon: Inbox },
            { label: "Kapalı talepler", value: query.data?.statuses.CLOSED, icon: CheckCheck },
            ...(user?.role === "CUSTOMER" ? [] : [
              { label: "Atanmamış talepler", value: query.data?.unassigned, icon: CircleDot },
              { label: "Aktif personel", value: query.data?.activeAgents, icon: CircleDot },
            ]),
          ].map((stat) => (
            <div className="stat-card" key={stat.label}>
              <div>{stat.label}<stat.icon size={19} /></div>
              <strong>{query.isPending ? "—" : (stat.value ?? 0)}</strong>
              <small>Erişebildiğiniz talepler</small>
            </div>
          ))}
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
