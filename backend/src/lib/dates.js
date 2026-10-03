// Fechas en la hora de Brasil (horarios del local, "pedidos de hoy"), no en UTC.
export const TIME_ZONE = "America/Sao_Paulo";

// Fecha "YYYY-MM-DD" de hoy en la zona.
export function todayIn(timeZone = TIME_ZONE, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// Cuánto está adelantada (o atrasada) la hora de la zona respecto de UTC en ese instante, en ms.
function offsetMs(instant, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
      .formatToParts(instant)
      .map((part) => [part.type, Number(part.value)])
  );
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return localAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

// Instante UTC de la hora local "HH:MM" del día "YYYY-MM-DD" en la zona.
export function localToUtc(day, time, timeZone = TIME_ZONE) {
  const [year, month, date] = day.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, date, hours, minutes);
  const first = guess - offsetMs(new Date(guess), timeZone);
  // Segunda pasada por si el offset cambia entre la suposición y el resultado (horario de verano).
  return new Date(guess - offsetMs(new Date(first), timeZone));
}

// "2026-09-30" + 2 → "2026-10-02"
export function addDays(day, amount) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + amount)).toISOString().slice(0, 10);
}

// 0 = domingo … 6 = sábado
export function weekdayOf(day) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay();
}

// Inicio (incluido) y fin (excluido) del día "YYYY-MM-DD" de la zona, como instantes UTC.
export function dayRange(day, timeZone = TIME_ZONE) {
  return { start: localToUtc(day, "00:00", timeZone), end: localToUtc(addDays(day, 1), "00:00", timeZone) };
}

export function isValidDay(day) {
  const [year, month, date] = day.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, date));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === date;
}
