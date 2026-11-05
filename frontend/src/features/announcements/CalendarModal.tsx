import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Megaphone,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../services/api";
import "./calendar.css";
import { Heading } from "../management/shared";
import { CalendarDayModal, type CalendarAnnouncement } from "./CalendarDayModal";

export function CalendarPage() {
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const announcements = useQuery({
    queryKey: ["/announcements", "calendar"],
    queryFn: async () => {
      const items: CalendarAnnouncement[] = [];
      let page = 1, totalPages = 1;
      do {
        const { data } = await api.get<{ data: CalendarAnnouncement[]; pagination: { totalPages: number } }>("/announcements", { params: { page, limit: 100 } });
        items.push(...data.data);
        totalPages = data.pagination.totalPages;
        page++;
      } while (page <= totalPages);
      return items;
    },
  });
  const year = cursor.getFullYear(),
    month = cursor.getMonth();
  const first = new Date(year, month, 1),
    start = (first.getDay() + 6) % 7;
  const cells = Array.from(
    { length: 42 },
    (_, i) => new Date(year, month, i - start + 1),
  );
  const today = new Date();
  const dateLabel = (date: Date) => date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const navigate = (direction: number) => setCursor(new Date(year, month + direction, 1));
  const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const events = useMemo(() => {
    const days = new Map<string, CalendarAnnouncement[]>();
    for (const item of announcements.data ?? []) {
      const date = new Date(item.eventAt ?? item.createdAt);
      const key = dayKey(date);
      days.set(key, [...(days.get(key) ?? []), item]);
    }
    return days;
  }, [announcements.data]);
  return (
    <main className="page calendar-page">
      <Heading
        title="Takvim"
        description="Duyuruları ve özel günleri takvim üzerinden takip edin."
      />
      <section className="calendar-modal" aria-label="Duyuru Takvimi">
        <header>
          <div>
            <CalendarDays size={20} />
            <h2>
              {cursor.toLocaleDateString("tr-TR", {
                month: "long",
                year: "numeric",
              })}
            </h2>
          </div>
        <div className="calendar-toolbar">
          <button type="button" onClick={() => setCursor(new Date())}>
            Bugün
          </button>
          <div>
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Önceki Ay"
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              onClick={() => navigate(1)}
              aria-label="Sonraki Ay"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
        </header>
        <div className="calendar-weekdays">
          {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {cells.map((date) => {
            const valid = date.getMonth() === month;
            const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
            const dailyEvents = events.get(key) ?? [];
            return (
              <div
                key={key}
                aria-label={`${dateLabel(date)}${dailyEvents.length ? `, ${dailyEvents.length} duyuru` : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedDay(date)}
                onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedDay(date); } }}
                className={`calendar-cell${!valid ? " muted" : ""}${date.toDateString() === today.toDateString() ? " today" : ""}`}
              >
                <span className="calendar-day-number">{date.getDate()}</span>
                {dailyEvents.slice(0, 2).map(event => (
                  <div className="calendar-event" title={event.title} key={event.id}>
                    <Megaphone size={12} />
                    <span className="calendar-event-title">{event.title}</span>
                  </div>
                ))}
                {dailyEvents.length > 2 && <span className="calendar-event-more" data-count={`+${dailyEvents.length - 2}`}>+{dailyEvents.length - 2} duyuru daha</span>}
              </div>
            );
          })}
        </div>
      </section>
      {selectedDay && <CalendarDayModal date={selectedDay} announcements={events.get(dayKey(selectedDay)) ?? []} onClose={() => setSelectedDay(null)} />}
    </main>
  );
}
