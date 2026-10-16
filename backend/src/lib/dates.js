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

// El día de operación de un local termina a la hora de corte que elige el local (05:00 si no
// eligió): con corte a las 05:00, un pedido de la 01:00 del sábado es de la noche del viernes
// (lista de pedidos del panel y cierre de caja). El pedido conserva su fecha real.
export const OPERATING_DAY_START = "05:00";

// Minutos desde la medianoche de una hora "HH:MM".
export const minutesOf = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

// Inicio (incluido) y fin (excluido) del día de operación "YYYY-MM-DD", como instantes UTC.
export function operatingDayRange(day, dayStart = OPERATING_DAY_START, timeZone = TIME_ZONE) {
  return {
    start: localToUtc(day, dayStart, timeZone),
    end: localToUtc(addDays(day, 1), dayStart, timeZone),
  };
}

// Día de operación en curso: antes de la hora de corte sigue siendo el de ayer.
export function operatingDayIn(dayStart = OPERATING_DAY_START, now = new Date(), timeZone = TIME_ZONE) {
  const today = todayIn(timeZone, now);
  return now < operatingDayRange(today, dayStart, timeZone).start ? addDays(today, -1) : today;
}

// Hora de corte de un local.
export const dayStartOf = (store) => store?.hours?.dayStart || OPERATING_DAY_START;
