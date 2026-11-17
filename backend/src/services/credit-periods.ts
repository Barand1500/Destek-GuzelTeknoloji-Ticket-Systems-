import { z } from "zod";

export const calendarDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value + "T00:00:00Z");
    return (
      value >= "1000-01-01" &&
      value <= "9998-12-31" &&
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Geçerli bir tarih girin.");
const name = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .transform((value) => value.replace(/\s+/g, " "));
export const durationFields = {
  periodMonths: z.number().int().min(1).max(120).nullable().optional(),
  periodDays: z.number().int().min(1).max(3650).nullable().optional(),
};
export const hasOneDuration = (input: {
  periodMonths?: number | null;
  periodDays?: number | null;
}) => (input.periodMonths != null) !== (input.periodDays != null);
export const durationInput = z
  .object(durationFields)
  .strict()
  .refine(hasOneDuration, "Gün veya ay cinsinden tek bir dönem seçin.");
const direct = z
  .object({
    name,
    unit: z.enum(["DAY", "MONTH", "YEAR"]),
    value: z.number().int().min(1).max(3650),
  })
  .strict()
  .refine(
    (value) =>
      value.value <=
      (value.unit === "DAY" ? 3650 : value.unit === "MONTH" ? 120 : 10),
    "Dönem süresi en fazla 10 yıl olabilir.",
  );
const range = z
  .object({ name, startsOn: calendarDay, endsOn: calendarDay })
  .strict()
  .refine(
    (value) => value.endsOn >= value.startsOn,
    "Bitiş tarihi başlangıçtan önce olamaz.",
  )
  .transform((value) => ({
    name: value.name,
    unit: "DAY" as const,
    value:
      Math.round(
        (Date.parse(value.endsOn) - Date.parse(value.startsOn)) / 86400000,
      ) + 1,
  }))
  .refine((value) => value.value <= 3650, "En fazla 3.650 gün seçilebilir.");
export const periodInput = z.union([direct, range]);

/** Inclusive end date, matching existing agreement month-end rules. */
export function periodEndDate(
  start: string,
  duration: z.input<typeof durationInput>,
): string {
  calendarDay.parse(start);
  const input = durationInput.parse(duration);
  const date = new Date(start + "T00:00:00Z");
  let end: Date;
  if (input.periodDays != null)
    end = new Date(date.getTime() + (input.periodDays - 1) * 86400000);
  else {
    const month = date.getUTCMonth() + input.periodMonths!,
      day = date.getUTCDate(),
      year = date.getUTCFullYear();
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    end = new Date(Date.UTC(year, month, day > lastDay ? lastDay : day - 1));
  }
  if (end.getUTCFullYear() > 9999)
    throw new Error("Dönem bitiş tarihi sınırı aşıldı.");
  return end.toISOString().slice(0, 10);
}
