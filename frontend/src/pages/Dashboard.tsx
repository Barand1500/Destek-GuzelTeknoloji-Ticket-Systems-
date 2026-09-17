import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Inbox, Clock3, CheckCheck, CircleDot } from "lucide-react";
import { api } from "../services/api";
import { useAuth } from "../features/auth/Auth";
import { QueryError } from "../features/tickets/Tickets";
import { statuses, type Status } from "../types";
export function Dashboard() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () =>
      (await api.get("/dashboard")).data.data as {
        total: number;
        unassigned: number;
        statuses: Partial<Record<Status, number>>;
      },
  });
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">GENEL BAKIŞ</span>
          <h1>Merhaba, {user?.name.split(" ")[0]}.</h1>
          <p>Destek alanınızda neler oluyor? İşte güncel durum.</p>
        </div>
        <Link className="button primary" to="/tickets">
          Taleplere git
          <ArrowRight size={16} />
        </Link>
      </div>
      {query.isError ? (
        <QueryError error={query.error} />
      ) : (
        <>
          <div className="stat-grid">
            {[
              { label: "Toplam talep", value: query.data?.total, icon: Inbox },
              {
                label: "Açık talepler",
                value: query.data?.statuses.OPEN,
                icon: CircleDot,
              },
              {
                label: "Bekleyen talepler",
                value: query.data?.statuses.PENDING,
                icon: Clock3,
              },
              {
                label: "Çözülen talepler",
                value: query.data?.statuses.RESOLVED,
                icon: CheckCheck,
              },
            ].map((stat) => (
              <div className="stat-card" key={stat.label}>
                <div>
                  {stat.label}
                  <stat.icon size={19} />
                </div>
                <strong>{query.isPending ? "—" : (stat.value ?? 0)}</strong>
                <small>Erişebildiğiniz talepler</small>
              </div>
            ))}
          </div>
          <section className="dashboard-card">
            <div>
              <span className="eyebrow">TALEP DURUMLARI</span>
              <h2>Her adımda kontrol sizde.</h2>
              <p>Açılıştan çözüme kadar tüm taleplerinizi takip edin.</p>
            </div>
            <div className="status-bars">
              {Object.entries(statuses).map(([key, label]) => (
                <Link key={key} to={`/tickets?status=${key}`}>
                  <span>{label}</span>
                  <div className="bar-track">
                    <div
                      style={{
                        width: `${(100 * (query.data?.statuses[key as Status] ?? 0)) / Math.max(1, query.data?.total ?? 1)}%`,
                      }}
                    />
                  </div>
                  <strong>{query.data?.statuses[key as Status] ?? 0}</strong>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
