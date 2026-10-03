// Estado de apertura de un local: horario semanal + excepciones por fecha + override
// manual del dueño (abrir, cerrar o pausar, con vencimiento opcional). Función pura:
// recibe el local y el momento, y no toca la base.
import { TIME_ZONE, addDays, localToUtc, todayIn, weekdayOf } from "../lib/dates.js";

export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// Cuántos días para adelante se busca la próxima apertura.
const LOOKAHEAD_DAYS = 8;

// Turnos de un día concreto: la excepción de esa fecha, si hay, o el horario semanal.
function intervalsFor(hours, day) {
  const exception = hours?.exceptions?.find((e) => e.date === day);
  if (exception) return exception.closed ? [] : exception.intervals;
  return hours?.weekly?.[WEEKDAYS[weekdayOf(day)]] ?? [];
}

// Turnos como rangos UTC [inicio, fin), ordenados y unidos cuando se tocan
// (ej. viernes 18:00–24:00 + sábado 00:00–02:00 = un solo rango).
export function openRanges(hours, now, timeZone = TIME_ZONE, lookaheadDays = LOOKAHEAD_DAYS) {
  const today = todayIn(timeZone, now);
  const ranges = [];
  for (let offset = -1; offset <= lookaheadDays; offset++) {
    const day = addDays(today, offset);
    for (const { open, close } of intervalsFor(hours, day)) {
      const start = localToUtc(day, open, timeZone);
      // "24:00" o un cierre antes de la apertura (18:00–02:00): termina al día siguiente.
      const end =
        close === "24:00"
          ? localToUtc(addDays(day, 1), "00:00", timeZone)
          : localToUtc(close <= open ? addDays(day, 1) : day, close, timeZone);
      ranges.push([start, end]);
    }
  }

  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = new Date(Math.max(last[1], range[1]));
    else merged.push([...range]);
  }
  return merged;
}

// Una categoría con horario (ej. café da manhã de 7:00 a 11:00) está disponible solo
// dentro de él, en los días elegidos (sin días = todos). Sin horario, siempre.
export function isCategoryAvailable(category, now = new Date(), timeZone = TIME_ZONE) {
  if (!category.schedule) return true;
  const { days = [], from, to } = category.schedule;
  const weekly = Object.fromEntries(
    WEEKDAYS.map((day) => [day, days.length === 0 || days.includes(day) ? [{ open: from, close: to }] : []])
  );
  return openRanges({ weekly, exceptions: [] }, now, timeZone).some(([start, end]) => start <= now && now < end);
}

const activeOverride = (override, now) => (override && (!override.until || override.until > now) ? override : null);

/**
 * @returns {{
 *   status: "open" | "closed" | "paused",
 *   acceptingOrders: boolean,
 *   closesAt: Date | null,      // abierto: hasta cuándo
 *   nextOpenAt: Date | null,    // cerrado: próxima apertura (null si no hay en los próximos días)
 *   pausedUntil: Date | null,   // pausado: hasta cuándo
 *   message: string,            // aviso de la pausa
 *   source: "schedule" | "override",
 * }}
 */
export function getOpeningStatus({ hours, override }, now = new Date(), timeZone = TIME_ZONE) {
  const ranges = openRanges(hours, now, timeZone);
  const current = ranges.find(([start, end]) => start <= now && now < end);
  const nextOpening = (from) => {
    const range = ranges.find(([start, end]) => end > from);
    if (!range) return null;
    return range[0] > from ? range[0] : from;
  };

  const base = { closesAt: null, nextOpenAt: null, pausedUntil: null, message: "" };
  const manual = activeOverride(override, now);

  if (manual?.mode === "paused") {
    return { ...base, status: "paused", acceptingOrders: false, pausedUntil: manual.until, message: manual.message ?? "", source: "override" };
  }
  if (manual?.mode === "closed") {
    return { ...base, status: "closed", acceptingOrders: false, nextOpenAt: manual.until ? nextOpening(manual.until) : null, source: "override" };
  }
  if (manual?.mode === "open") {
    return { ...base, status: "open", acceptingOrders: true, closesAt: manual.until ?? null, source: "override" };
  }
  if (current) {
    return { ...base, status: "open", acceptingOrders: true, closesAt: current[1], source: "schedule" };
  }
  return { ...base, status: "closed", acceptingOrders: false, nextOpenAt: nextOpening(now), source: "schedule" };
}
