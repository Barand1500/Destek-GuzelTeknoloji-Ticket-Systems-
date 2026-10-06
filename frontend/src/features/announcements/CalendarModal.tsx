import { useLayoutEffect, useMemo, useRef, useState } from "react";
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
  const page = useRef<HTMLElement>(null);
  const [availableHeight, setAvailableHeight] = useState<number>();
  useLayoutEffect(() => {
    const fitViewport = () => {
      if (!page.current) return;
      const top = page.current.getBoundingClientRect().top + window.scrollY;
      setAvailableHeight(Math.max(0, window.innerHeight - top));
    };
    fitViewport();
    const observer = new ResizeObserver(fitViewport);
    document.querySelectorAll(".topbar, .sidebar").forEach(node => observer.observe(node));
    window.addEventListener("resize", fitViewport);
    return () => { observer.disconnect(); window.removeEventListener("resize", fitViewport); };
  }, []);
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
    <main ref={page} className="page calendar-page" style={{ height: availableHeight }}>
      <Heading
        title="Takvim"
        description="Duyuruları ve özel günleri takvim üzerinden takip edin."
      />
      <section className="calendar-modal" aria-label="Duyuru takvimi">
        <header>
          <div>
            <CalendarDays size={20} />
            <h1>
              {cursor.toLocaleDateString("tr-TR", {
                month: "long",
                year: "numeric",
              })}
            </h1>
          </div>
        </header>
        <div className="calendar-toolbar">
          <button type="button" onClick={() => setCursor(new Date())}>
            Bugün
          </button>
          <div>
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Önceki ay"
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              onClick={() => navigate(1)}
              aria-label="Sonraki ay"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
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
            const event = dailyEvents[0];
            return (
              <div
                key={key}
                aria-label={dateLabel(date)}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedDay(date)}
                onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedDay(date); } }}
                className={`calendar-cell${!valid ? " muted" : ""}${date.toDateString() === today.toDateString() ? " today" : ""}`}
              >
                <span>{date.getDate()}</span>
                {event && (
                  <div className="calendar-event" title={event.title}>
                    <Megaphone size={12} />
                    {event.title}
                    {dailyEvents.length > 1 && <strong className="calendar-event-more">+{dailyEvents.length - 1}</strong>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
      {selectedDay && <CalendarDayModal date={selectedDay} announcements={events.get(dayKey(selectedDay)) ?? []} onClose={() => setSelectedDay(null)} />}
    </main>
  );
}
