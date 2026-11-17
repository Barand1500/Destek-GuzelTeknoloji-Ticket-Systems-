import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";
import { SearchableDropdown } from "../../components/SearchableDropdown";
import { api } from "../../services/api";
import { ErrorMessage } from "../management/shared";
import { count, periodLabel } from "./types";

type Period = {
  id: string;
  name: string;
  unit: "DAY" | "MONTH" | "YEAR";
  value: number;
};
type Terms = {
  periodMonths: number | null;
  periodDays?: number | null;
  periodName?: string | null;
};
const builtins: Period[] = [1, 3, 6].map((value) => ({
  id: `MONTH${value}`,
  name: "",
  unit: "MONTH",
  value,
}));
builtins.push({ id: "YEAR1", name: "", unit: "YEAR", value: 1 });
const terms = (p: Period): Terms => ({
  periodMonths:
    p.unit === "DAY" ? null : p.value * (p.unit === "YEAR" ? 12 : 1),
  periodDays: p.unit === "DAY" ? p.value : null,
  periodName: p.name || null,
});
const iso = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
const shortDate = (value: string) => value.split("-").reverse().join(".");
export function PeriodSelect({
  value,
  onChange,
}: {
  value: Terms;
  onChange: (terms: Terms) => void;
}) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["credit-sales-periods"],
    queryFn: async () =>
      (await api.get("/credit-sales/periods")).data.data as Period[],
  });
  const [calendarOpen, setCalendarOpen] = useState(false),
    [name, setName] = useState("");
  const root = useRef<HTMLDivElement>(null),
    anchor = useRef<HTMLButtonElement>(null),
    popup = useRef<HTMLDivElement>(null);
  const mountPopup = useCallback(
    (node: HTMLDivElement | null) => {
      popup.current = node;
      if (node && calendarOpen) {
        node.showPopover();
        window.dispatchEvent(new Event("resize"));
      }
    },
    [calendarOpen],
  );
  const [position, setPosition] = useState({ left: 8, top: 8, maxHeight: 320 });
  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setCalendarOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);
  useLayoutEffect(() => {
    if (!calendarOpen) return;
    popup.current?.showPopover();
    const measure = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 16,
        above = rect.top - 16;
      const naturalHeight = (popup.current?.scrollHeight ?? 260) + 2;
      const opensBelow = below >= naturalHeight || below >= above;
      const height = Math.min(
        naturalHeight,
        Math.max(100, opensBelow ? below : above),
      );
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 288)),
        top: opensBelow ? rect.bottom + 8 : Math.max(8, rect.top - height - 8),
        maxHeight: height,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      if (popup.current?.matches(":popover-open")) popup.current.hidePopover();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [calendarOpen]);
  const [month, setMonth] = useState(() => new Date());
  const [startsOn, setStartsOn] = useState(""),
    [endsOn, setEndsOn] = useState("");
  const periods = [...builtins, ...(query.data ?? [])];
  const selected = periods.find((p) => {
    const t = terms(p);
    return (
      t.periodMonths === value.periodMonths &&
      (t.periodDays ?? null) === (value.periodDays ?? null) &&
      t.periodName === (value.periodName ?? null)
    );
  });
  const days =
    startsOn && endsOn
      ? Math.round((Date.parse(endsOn) - Date.parse(startsOn)) / 86400000) + 1
      : 0;
  const valid = name.trim() && days >= 1 && days <= 3650;
  const add = useMutation({
    mutationKey: ["credit-sales-periods"],
    mutationFn: async () =>
      (
        await api.post("/credit-sales/periods", {
          name: name.trim(),
          startsOn,
          endsOn,
        })
      ).data.data as Period,
    onSuccess: async (p) => {
      client.setQueryData<Period[]>(["credit-sales-periods"], (old) => [
        ...(old ?? []),
        p,
      ]);
      onChange(terms(p));
      setName("");
      setStartsOn("");
      setEndsOn("");
      setCalendarOpen(false);
      await client.invalidateQueries({ queryKey: ["credit-sales-periods"] });
    },
  });
  const remove = useMutation({
    mutationKey: ["credit-sales-periods"],
    mutationFn: (id: string) => api.delete(`/credit-sales/periods/${id}`),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["credit-sales-periods"] });
    },
  });
  const pending = add.isPending || remove.isPending;
  const choose = (day: string) => {
    if (!startsOn || endsOn) {
      setStartsOn(day);
      setEndsOn("");
    } else {
      setStartsOn(day < startsOn ? day : startsOn);
      setEndsOn(day < startsOn ? startsOn : day);
      setCalendarOpen(false);
      anchor.current?.focus();
    }
  };
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(1 - ((first.getDay() + 6) % 7));
  const dayCount =
    Math.ceil(
      (((first.getDay() + 6) % 7) +
        new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) /
        7,
    ) * 7;
  return (
    <div ref={root} className="credit-period-select">
      <SearchableDropdown
        placement="auto"
        maxMenuHeight={240}
        label="Abonelik dönemi"
        name="period"
        value={selected?.id ?? "snapshot"}
        disabled={pending}
        options={[
          ...periods.map((p) => ({
            value: p.id,
            label: periodLabel(terms(p)),
          })),
          ...(!selected
            ? [{ value: "snapshot", label: periodLabel(value) }]
            : []),
        ]}
        onChange={(id) => {
          const p = periods.find((p) => p.id === id);
          if (p) onChange(terms(p));
        }}
        optionAction={(option) =>
          query.data?.some((p) => p.id === option.value) ? (
            <button
              type="button"
              className="credit-period-remove"
              disabled={pending}
              aria-label={`${option.label} dönemini sil`}
              onClick={() => remove.mutate(option.value)}
            >
              <Trash2 size={14} />
            </button>
          ) : null
        }
        footer={
          <div className="credit-period-footer">
            <div className="credit-period-add-row">
              <button
                ref={anchor}
                type="button"
                className="button secondary"
                aria-label="Dönem takvimini aç"
                aria-expanded={calendarOpen}
                disabled={pending}
                onClick={() => setCalendarOpen((open) => !open)}
              >
                <CalendarDays size={16} />
              </button>
              <input
                aria-label="Yeni dönem adı"
                placeholder="Yeni dönem adı…"
                maxLength={80}
                value={name}
                disabled={pending}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (valid && !pending) add.mutate();
                  }
                }}
              />
              <button
                type="button"
                className="button secondary"
                aria-label="Dönem Ekle"
                disabled={!valid || pending || (query.data?.length ?? 0) >= 100}
                onClick={() => add.mutate()}
              >
                <Plus size={16} />
              </button>
            </div>
            {(startsOn || calendarOpen) && (
              <p className="credit-period-range-summary" role="status">
                {startsOn
                  ? `${shortDate(startsOn)}${endsOn ? ` – ${shortDate(endsOn)} · ${count(days)} gün (dahil)` : " · Bitiş gününü seçin"}`
                  : "Başlangıç ve bitiş gününü seçin"}
                {days > 3650 && " · En fazla 3650 gün"}
              </p>
            )}
            {calendarOpen && (
              <div
                ref={mountPopup}
                popover="manual"
                style={position}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setCalendarOpen(false);
                    anchor.current?.focus();
                  }
                }}
                className="credit-period-range"
                role="group"
                aria-label="Dönem tarih aralığı"
              >
                <div className="credit-period-range-heading">
                  <button
                    type="button"
                    aria-label="Dönem önceki ay"
                    disabled={
                      first.getFullYear() === 1000 && first.getMonth() === 0
                    }
                    onClick={() =>
                      setMonth(
                        new Date(first.getFullYear(), first.getMonth() - 1, 1),
                      )
                    }
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <strong>
                    {first.toLocaleDateString("tr-TR", {
                      month: "long",
                      year: "numeric",
                    })}
                  </strong>
                  <button
                    type="button"
                    aria-label="Dönem sonraki ay"
                    disabled={
                      first.getFullYear() === 9998 && first.getMonth() === 11
                    }
                    onClick={() =>
                      setMonth(
                        new Date(first.getFullYear(), first.getMonth() + 1, 1),
                      )
                    }
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="credit-period-range-grid">
                  {["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"].map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                  {Array.from({ length: dayCount }, (_, index) => {
                    const day = new Date(gridStart);
                    day.setDate(day.getDate() + index);
                    const key = iso(day);
                    return (
                      <button
                        type="button"
                        key={key}
                        disabled={
                          day.getFullYear() < 1000 || day.getFullYear() > 9998
                        }
                        aria-label={day.toLocaleDateString("tr-TR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                        aria-pressed={key === startsOn || key === endsOn}
                        data-in-range={
                          !!(
                            startsOn &&
                            endsOn &&
                            key > startsOn &&
                            key < endsOn
                          )
                        }
                        className={
                          day.getMonth() !== first.getMonth()
                            ? "outside-month"
                            : ""
                        }
                        onClick={() => choose(key)}
                      >
                        {day.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        }
      />
      <ErrorMessage error={query.error || add.error || remove.error} />
    </div>
  );
}
