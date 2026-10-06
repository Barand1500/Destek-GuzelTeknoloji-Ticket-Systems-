import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Download,
  Medal,
  Target,
  UserRound,
} from "lucide-react";
import { api } from "../../services/api";
import { useAuth } from '../auth/Auth';
import { hasPermission } from '../auth/permissions';
import { statuses, priorities } from "../../types";
import { Heading, ListState } from "./shared";
import { DropdownSelect } from "../../components/DropdownSelect";
import "./reports.css";

type Employee = {
  id: string;
  name: string;
  assigned: number;
  resolved: number;
};
type DepartmentReport = {
  id: string;
  name: string;
  count: number;
  statuses: Record<string, number>;
  employees: Employee[];
};
type StaffReport = Employee & {
  email: string | null;
  departmentIds: string[];
  statuses: Record<string, number>;
  firstResponseMinutes: number | null;
};
type Report = {
  period: { from: string; to: string };
  total: number;
  statuses: Record<string, number>;
  priorities: Record<string, number>;
  departments: DepartmentReport[];
  staff: StaffReport[];
  daily: { date: string; created: number; resolved: number }[];
  firstResponseMinutes: number | null;
  resolutionMinutes: number | null;
};
type Tab = "general" | "person" | "department";
const tabs = [
  { id: "general", label: "Genel Rapor", icon: BarChart3 },
  { id: "person", label: "Kişi Raporu", icon: UserRound },
  { id: "department", label: "Departman Raporu", icon: Building2 },
] as const;
const percent = (done: number, total: number) =>
  total ? Math.round((done * 100) / total) : 0;
const completed = (counts: Record<string, number>) =>
  (counts.RESOLVED ?? 0) + (counts.CLOSED ?? 0);
const duration = (minutes: number | null) =>
  minutes === null
    ? "Henüz veri yok"
    : minutes < 60
      ? `${Math.round(minutes)} dk`
      : minutes < 1440
        ? `${(minutes / 60).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} saat`
        : `${(minutes / 1440).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} gün`;
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("tr-TR");
const palette: Record<string, string> = {
  URGENT: "#ef4444",
  HIGH: "#f59e0b",
  NORMAL: "#398571",
  LOW: "#94a3b8",
};

function Panel({
  title,
  children,
  extra,
}: {
  title: string;
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <section className="report-panel">
      <div className="report-panel-heading">
        <h2>{title}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}
function Progress({ value, total }: { value: number; total: number }) {
  return (
    <div
      className="report-progress"
      role="progressbar"
      aria-label="Tamamlanma"
      aria-valuenow={percent(value, total)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${percent(value, total)}%` }} />
    </div>
  );
}
function EmployeeRow({
  person,
  rank,
  onClick,
}: {
  person: Employee;
  rank?: number;
  onClick?: () => void;
}) {
  const rate = percent(person.resolved, person.assigned);
  const content = (
    <>
      {rank !== undefined && <span className="report-rank">{rank}</span>}
      <span className="report-avatar">{initials(person.name)}</span>
      <span className="report-employee-name">
        <strong>{person.name}</strong>
        <small>
          {person.resolved}/{person.assigned} talep
        </small>
      </span>
      <strong className={rate >= 50 ? "report-success" : "report-muted"}>
        %{rate}
      </strong>
    </>
  );
  return onClick ? (
    <button type="button" className="report-employee" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="report-employee">{content}</div>
  );
}
function Stats({ data }: { data: Report }) {
  const done = completed(data.statuses);
  const cards = [
    {
      label: "Toplam Talep",
      value: data.total,
      icon: ClipboardList,
      tone: "purple",
    },
    { label: "Tamamlanan", value: done, icon: CheckCircle2, tone: "green" },
    {
      label: "Bekleyen",
      value: data.statuses.PENDING ?? 0,
      icon: Clock3,
      tone: "orange",
    },
    {
      label: "Tamamlanma",
      value: `%${percent(done, data.total)}`,
      icon: Target,
      tone: "purple",
    },
  ];
  return (
    <div className="report-stats">
      {cards.map(({ label, value, icon: Icon, tone }) => (
        <section className="report-stat" key={label}>
          <span className={`report-stat-icon ${tone}`}>
            <Icon size={23} />
          </span>
          <strong>{value}</strong>
          <span>{label}</span>
        </section>
      ))}
    </div>
  );
}
function Trend({ daily }: { daily: Report["daily"] }) {
  // Aggregate into actual seven- or fourteen-day intervals.
  const size = daily.length <= 7 ? 1 : daily.length <= 30 ? 7 : 14;
  const buckets = Array.from(
    { length: Math.ceil(daily.length / size) },
    (_, index) => {
      const rows = daily.slice(index * size, (index + 1) * size);
      return {
        date: rows[0].date,
        created: rows.reduce((sum, day) => sum + day.created, 0),
        resolved: rows.reduce((sum, day) => sum + day.resolved, 0),
      };
    },
  );
  const max = Math.max(
    1,
    ...buckets.flatMap((day) => [day.created, day.resolved]),
  );
  return (
    <Panel
      title={
        size === 1
          ? "Günlük Talep Trendi"
          : size === 7
            ? "Haftalık Talep Trendi"
            : "İki Haftalık Talep Trendi"
      }
      extra={
        <div className="report-legend">
          <span>
            <i style={{ background: "#167766" }} />
            Tamamlanan
          </span>
          <span>
            <i style={{ background: "#94a3b8" }} />
            Oluşturulan
          </span>
        </div>
      }
    >
      {!daily.some((day) => day.created || day.resolved) && (
        <p className="report-chart-note">
          Bu dönemde talep hareketi bulunmuyor.
        </p>
      )}
      <div className="report-trend">
        <div className="report-axis">
          {[max, Math.round(max / 2), 0].map((value, index) => (
            <span key={index}>{value}</span>
          ))}
        </div>
        <div className="report-chart-bars">
          {buckets.map((day) => (
            <div className="report-chart-column" key={day.date}>
              <div className="report-bar-pair">
                <div
                  className="report-chart-bar created"
                  style={{ height: `${(day.created * 100) / max}%` }}
                >
                  <span>{day.created}</span>
                </div>
                <div
                  className="report-chart-bar resolved"
                  style={{ height: `${(day.resolved * 100) / max}%` }}
                >
                  <span>{day.resolved}</span>
                </div>
              </div>
              <span className="report-date">
                {new Date(`${day.date}T12:00:00`).toLocaleDateString("tr-TR", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
function PriorityChart({ data }: { data: Report }) {
  const keys = [
    ...new Set([...Object.keys(priorities), ...Object.keys(data.priorities)]),
  ];
  let offset = 0;
  const slices = keys.map((key, index) => {
    const start = offset;
    offset += data.total ? ((data.priorities[key] ?? 0) * 100) / data.total : 0;
    return `${palette[key] ?? ["#167766", "#14b8a6", "#0f766e"][index % 3]} ${start}% ${offset}%`;
  });
  return (
    <Panel title="Öncelik Dağılımı">
      <div
        className="report-donut"
        role="img"
        aria-label={`${data.total} talep, öncelik dağılımı aşağıda`}
        style={{
          background: data.total
            ? `conic-gradient(${slices.join(",")})`
            : "var(--report-track)",
        }}
      >
        <div>
          <strong>{data.total}</strong>
          <small>Talep</small>
        </div>
      </div>
      <div className="report-priority-list">
        {keys.map((key, index) => (
          <div key={key}>
            <span>
              <i
                style={{
                  background:
                    palette[key] ??
                    ["#167766", "#14b8a6", "#0f766e"][index % 3],
                }}
              />
              {priorities[key] ?? key}
            </span>
            <strong>{data.priorities[key] ?? 0}</strong>
          </div>
        ))}
      </div>
    </Panel>
  );
}
function ResponseTimes({ data }: { data: Report }) {
  return (
    <Panel title="Yanıt ve Çözüm Süreleri">
      <div className="report-duration">
        <span>Ortalama ilk yanıt</span>
        <strong>{duration(data.firstResponseMinutes)}</strong>
      </div>
      <div className="report-duration">
        <span>Ortalama çözüm süresi</span>
        <strong>{duration(data.resolutionMinutes)}</strong>
      </div>
      <p className="report-note">
        Süreler seçili dönemde açılan ve ilgili zaman kaydı bulunan taleplerden hesaplanır.
      </p>
    </Panel>
  );
}
function Details({ data }: { data: Report }) {
  return (
    <div className="report-two-columns">
      <Panel title="Durum Dağılımı">
        <div className="report-status-list">
          {[
            ...new Set([
              ...Object.keys(statuses),
              ...Object.keys(data.statuses),
            ]),
          ].map((key) => (
            <div key={key}>
              <div>
                <span>{statuses[key] ?? key}</span>
                <strong>{data.statuses[key] ?? 0}</strong>
              </div>
              <Progress value={data.statuses[key] ?? 0} total={data.total} />
            </div>
          ))}
        </div>
      </Panel>
      <ResponseTimes data={data} />
    </div>
  );
}

function downloadReport(
  data: Report,
  tab: Tab,
  personId: string,
  departmentId: string,
  base: Report,
) {
  const person = base.staff.find((row) => row.id === personId);
  const rows: (string | number)[][] = [
    ["Rapor", tabs.find((item) => item.id === tab)!.label],
    [
      "Kapsam",
      tab === "person"
        ? (person?.name ?? "")
        : tab === "department"
          ? (base.departments.find((row) => row.id === departmentId)?.name ??
            "Tüm departmanlar")
          : "Genel",
    ],
    [
      "Trend ve süre dönemi",
      new Date(data.period.from).toLocaleDateString("tr-TR"),
      new Date(data.period.to).toLocaleDateString("tr-TR"),
    ],
    ["Talep adetleri", "Tüm zamanlar"],
    [],
    ["Toplam", data.total],
    ["Tamamlanan", completed(data.statuses)],
    ["Tamamlanma (%)", percent(completed(data.statuses), data.total)],
    ["Ortalama ilk yanıt (dk)", data.firstResponseMinutes ?? ""],
    ["Ortalama çözüm (dk)", data.resolutionMinutes ?? ""],
    [],
    ["Durum", "Adet"],
    ...Object.entries(data.statuses).map(([key, value]) => [
      statuses[key] ?? key,
      value,
    ]),
    [],
    ["Öncelik", "Adet"],
    ...Object.entries(data.priorities).map(([key, value]) => [
      priorities[key] ?? key,
      value,
    ]),
    [],
    ["Tarih (UTC)", "Oluşturulan", "Tamamlanan"],
    ...data.daily.map((day) => [day.date, day.created, day.resolved]),
  ];
  if (tab !== "person")
    rows.push(
      [],
      ["Departman", "Toplam", "Tamamlanan", "Tamamlanma (%)"],
      ...data.departments
        .filter((row) => !departmentId || row.id === departmentId)
        .map((row) => [
          row.name,
          row.count,
          completed(row.statuses),
          percent(completed(row.statuses), row.count),
        ]),
      [],
      ["Çalışan", "Atanan", "Tamamlanan", "Tamamlanma (%)"],
      ...data.staff.map((row) => [
        row.name,
        row.assigned,
        row.resolved,
        percent(row.resolved, row.assigned),
      ]),
    );
  const escape = (value: string | number) =>
    `"${String(typeof value === "string" && /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
  const url = URL.createObjectURL(
    new Blob(
      ["\uFEFF", rows.map((row) => row.map(escape).join(";")).join("\r\n")],
      { type: "text/csv;charset=utf-8;" },
    ),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `rapor-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ReportsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("general");
  const [personId, setPersonId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [days, setDays] = useState(30);
  const base = useQuery({
    queryKey: ["/reports", "overview", days],
    queryFn: async () =>
      (await api.get("/reports", { params: { days } })).data.data as Report,
  });
  const filter =
    tab === "person"
      ? { agentId: personId || undefined }
      : tab === "department"
        ? { departmentId: departmentId || undefined }
        : {};
  const filtered = useQuery({
    queryKey: ["/reports", "filtered", days, filter],
    queryFn: async () =>
      (await api.get("/reports", { params: { days, ...filter } })).data
        .data as Report,
    enabled:
      (tab === "person" && !!personId) ||
      (tab === "department" && !!departmentId),
  });
  const needsFilter =
    (tab === "person" && !!personId) ||
    (tab === "department" && !!departmentId);
  const query = needsFilter ? filtered : base;
  const data = query.data;
  const selected = base.data?.staff.find((person) => person.id === personId);
  const ready =
    !!data &&
    !!base.data &&
    !query.isFetching &&
    !query.isError &&
    (tab !== "person" || !!selected);
  const showPerson = (id: string) => {
    setPersonId(id);
    setTab("person");
  };
  return (
    <main className="page reports-page">
      <Heading
        title="Raporlar & İstatistikler"
        description="Talep yoğunluğunu ve ekip performansını analiz edin."
      >
        <button
          className="button secondary report-download"
          type="button"
          disabled={!ready || !hasPermission(user, 'reports.export')}
          onClick={() =>
            ready && hasPermission(user, 'reports.export') &&
            downloadReport(
              data!,
              tab,
              personId,
              tab === "department" ? departmentId : "",
              base.data!,
            )
          }
        >
          <Download size={17} />
          Rapor İndir
        </button>
      </Heading>
      <div className="report-tab-row">
        <div className="report-tabs" role="tablist" aria-label="Rapor türü">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={`report-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls="report-content"
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
              onKeyDown={(event) => {
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
                ) {
                  event.preventDefault();
                  const index = tabs.findIndex((item) => item.id === id);
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? 2
                        : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
                  setTab(tabs[next].id);
                  document
                    .getElementById(`report-tab-${tabs[next].id}`)
                    ?.focus();
                }
              }}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </div>
        <div className="report-period-control">
          <DropdownSelect
            label="Trend ve süre dönemi"
            ariaLabel="Trend ve süre dönemi"
            value={String(days)}
            onChange={(value) => setDays(Number(value))}
            options={[
              { value: "7", label: "Son 7 gün" },
              { value: "30", label: "Son 30 gün" },
              { value: "90", label: "Son 90 gün" },
            ]}
          />
        </div>
      </div>
      <div className="report-filters">
        {tab === "person" && (
          <DropdownSelect
            label="Çalışan Seçin"
            ariaLabel="Çalışan seçin"
            value={personId}
            onChange={setPersonId}
            options={[
              { value: "", label: "— Çalışan seçin —" },
              ...(base.data?.staff ?? []).map((person) => ({
                value: person.id,
                label: person.name,
              })),
            ]}
          />
        )}
        {tab === "department" && (
          <DropdownSelect
            label="Departman"
            ariaLabel="Departman seçin"
            value={departmentId}
            onChange={setDepartmentId}
            options={[
              { value: "", label: "Tüm Departmanlar" },
              ...(base.data?.departments ?? []).map((department) => ({
                value: department.id,
                label: department.name,
              })),
            ]}
          />
        )}
      </div>
      <div
        id="report-content"
        role="tabpanel"
        aria-labelledby={`report-tab-${tab}`}
        aria-busy={query.isFetching}
      >
        <ListState
          loading={query.isPending || base.isPending}
          error={query.error || base.error}
          empty={false}
        />
        {(query.isError || base.isError) && (
          <button
            className="button secondary"
            onClick={() => {
              void base.refetch();
              if (needsFilter) void filtered.refetch();
            }}
          >
            Tekrar dene
          </button>
        )}
        {tab === "person" && !personId && !base.isPending && !base.isError && (
          <div className="report-empty">
            <UserRound size={46} />
            <p>Rapor görmek için bir çalışan seçin</p>
            {!base.data?.staff.length && (
              <small>Raporlanacak destek uzmanı bulunmuyor.</small>
            )}
          </div>
        )}
        {data &&
          !query.isError &&
          !base.isError &&
          (tab !== "person" || !!selected) && (
            <>
              {tab === "person" && selected && (
                <div className="report-person-header">
                  <span className="report-avatar">
                    {initials(selected.name)}
                  </span>
                  <div>
                    <h2>{selected.name}</h2>
                    <p>{selected.email || "E-posta kayıtlı değil"}</p>
                    <small>
                      {base.data?.departments
                        .filter((department) =>
                          selected.departmentIds.includes(department.id),
                        )
                        .map((department) => department.name)
                        .join(" · ") || "Departman atanmamış"}
                    </small>
                  </div>
                </div>
              )}
              {tab !== "department" && (
                <>
                  <Stats data={data} />
                  <div className="report-chart-grid">
                    <Trend daily={data.daily} />
                    <PriorityChart data={data} />
                  </div>
                </>
              )}
              {tab === "general" && (
                <div className="report-two-columns report-general-performance">
                  <div className="report-performance-stack">
                  <Panel title="Departman Performansı">
                    <div className="report-status-list">
                      {data.departments.map((department) => (
                        <button
                          className="report-department-link"
                          key={department.id}
                          onClick={() => {
                            setDepartmentId(department.id);
                            setTab("department");
                          }}
                        >
                          <div>
                            <strong>{department.name}</strong>
                            <span>
                              {completed(department.statuses)}/
                              {department.count} (%
                              {percent(
                                completed(department.statuses),
                                department.count,
                              )}
                              )
                            </span>
                          </div>
                          <Progress
                            value={completed(department.statuses)}
                            total={department.count}
                          />
                        </button>
                      ))}
                      {!data.departments.length && (
                        <p className="report-note">Departman bulunamadı.</p>
                      )}
                    </div>
                  </Panel>
                  <ResponseTimes data={data} />
                  </div>
                  <Panel
                    title="Çalışan Sıralaması"
                    extra={<Medal size={21} className="report-medal" />}
                  >
                    <div className="report-ranking">
                      {[...data.staff]
                        .sort(
                          (a, b) =>
                            percent(b.resolved, b.assigned) -
                              percent(a.resolved, a.assigned) ||
                            b.resolved - a.resolved ||
                            a.name.localeCompare(b.name, "tr"),
                        )
                        .map((person, index) => (
                          <EmployeeRow
                            key={person.id}
                            person={person}
                            rank={index + 1}
                            onClick={() => showPerson(person.id)}
                          />
                        ))}
                    </div>
                    {!data.staff.length && (
                      <p className="report-note">Çalışan bulunamadı.</p>
                    )}
                  </Panel>
                </div>
              )}
              {tab === "department" && (
                <div className="report-department-list">
                  {data.departments
                    .filter(
                      (department) =>
                        !departmentId || department.id === departmentId,
                    )
                    .map((department) => (
                      <section
                        className="report-department-card"
                        key={department.id}
                      >
                        <header>
                          <span className="report-stat-icon purple">
                            <Building2 size={23} />
                          </span>
                          <div>
                            <h2>{department.name}</h2>
                            <p>
                              {department.employees.length} çalışan ·{" "}
                              {department.count} talep
                            </p>
                          </div>
                          <div className="report-department-rate">
                            <strong>
                              %
                              {percent(
                                completed(department.statuses),
                                department.count,
                              )}
                            </strong>
                            <small>Tamamlanma</small>
                          </div>
                        </header>
                        <div className="report-department-body">
                          <div className="report-department-stats">
                            {[
                              {
                                label: "Tamamlanan",
                                value: completed(department.statuses),
                                tone: "report-success",
                              },
                              {
                                label: "Devam Eden",
                                value: department.statuses.IN_PROGRESS ?? 0,
                                tone: "report-blue",
                              },
                              {
                                label: "Bekleyen",
                                value: department.statuses.PENDING ?? 0,
                                tone: "report-orange",
                              },
                              {
                                label: "Açık",
                                value: department.statuses.OPEN ?? 0,
                                tone: "report-purple",
                              },
                            ].map((item) => (
                              <div key={item.label}>
                                <strong className={item.tone}>
                                  {item.value}
                                </strong>
                                <small>{item.label}</small>
                              </div>
                            ))}
                          </div>
                          <div className="report-progress-label">
                            <span>İlerleme</span>
                            <span>
                              {completed(department.statuses)}/
                              {department.count}
                            </span>
                          </div>
                          <Progress
                            value={completed(department.statuses)}
                            total={department.count}
                          />
                          <h3>Departman Çalışanları</h3>
                          {department.employees.map((person) => (
                            <EmployeeRow
                              key={person.id}
                              person={person}
                              onClick={() => showPerson(person.id)}
                            />
                          ))}
                          {!department.employees.length && (
                            <p className="report-note">
                              Bu departmana çalışan atanmamış.
                            </p>
                          )}
                          <p className="report-note">
                            Çalışan adetleri bu departmandaki mevcut atamalara
                            aittir; atanmamış talepler departman toplamına
                            dahildir.
                          </p>
                        </div>
                      </section>
                    ))}
                  {!data.departments.length && (
                    <div className="report-empty">
                      <Building2 size={46} />
                      <p>Raporlanacak departman bulunmuyor.</p>
                    </div>
                  )}
                </div>
              )}
              {tab !== "general" && <Details data={data} />}
              {tab === "general" && (
                <Panel title="Ekip performansı">
                  <div className="management-table-wrap">
                    <table className="management-table">
                      <thead>
                        <tr>
                          <th>Çalışan</th>
                          <th>Atanan talep</th>
                          <th>Tamamlanan</th>
                          <th>Tamamlanma</th>
                          <th>Ortalama ilk yanıt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.staff.map((person) => (
                          <tr key={person.id}>
                            <td>
                              <button
                                type="button"
                                className="report-name-button"
                                onClick={() => showPerson(person.id)}
                              >
                                {person.name}
                              </button>
                              <small>{person.email}</small>
                            </td>
                            <td>{person.assigned}</td>
                            <td>{person.resolved}</td>
                            <td>
                              %{percent(person.resolved, person.assigned)}
                            </td>
                            <td>{duration(person.firstResponseMinutes)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!data.staff.length && (
                    <p className="report-note">Çalışan bulunamadı.</p>
                  )}
                </Panel>
              )}
            </>
          )}
      </div>
    </main>
  );
}
