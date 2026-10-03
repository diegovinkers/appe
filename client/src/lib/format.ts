import { getLanguage, getT } from "../i18n";

// Todo en la hora de Brasil, aunque la PC tenga otra zona configurada.
const TIME_ZONE = "America/Sao_Paulo";

const timeFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const weekdayFormats = {
  "pt-BR": new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, weekday: "short" }),
  es: new Intl.DateTimeFormat("es", { timeZone: TIME_ZONE, weekday: "short" }),
};
// Siempre reales con el formato de Brasil: en español saldría "BRL 70,00".
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const formatTime = (date: Date | string) => timeFormat.format(new Date(date));

export const formatMoney = (cents: number) => money.format(cents / 100);

// "hoje 18:00", "amanhã 18:00" o "sáb 18:00" (en español: "hoy", "mañana", "sáb").
export function formatWhen(date: Date | string, now = new Date()): string {
  const t = getT();
  const target = new Date(date);
  const day = dayFormat.format(target);
  const today = dayFormat.format(now);
  const tomorrow = dayFormat.format(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const time = formatTime(target);
  if (day === today) return `${t.status.today} ${time}`;
  if (day === tomorrow) return `${t.status.tomorrow} ${time}`;
  return `${weekdayFormats[getLanguage()].format(target).replace(".", "")} ${time}`;
}

// "2026-09-27": el día de hoy en Brasil (para pedir los pedidos del día).
export const todayISO = (now = new Date()) => dayFormat.format(now);

// "2026-09-27" → "27/09".
export const formatDay = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

const inputFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// Para <input type="datetime-local">, en hora de Brasil: ISO → "2026-09-27T20:30" y al revés.
export const toBrazilInput = (iso: string | null | undefined) => (iso ? inputFormat.format(new Date(iso)).replace(" ", "T") : "");
export const fromBrazilInput = (value: string) => (value ? `${value}:00-03:00` : null);

// Nota promedio con un decimal y coma: 4.8 → "4,8".
export const formatRating = (value: number) => value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const dateFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" });

// "27/09/2026", en hora de Brasil.
export const formatDate = (date: Date | string) => dateFormat.format(new Date(date));
