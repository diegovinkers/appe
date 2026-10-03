// Pedidos programados: qué horarios puede elegir el cliente. Función pura.
import { TIME_ZONE, addDays, localToUtc, todayIn } from "../lib/dates.js";
import { badRequest } from "../lib/errors.js";
import { openRanges } from "./opening.service.js";

const pad = (value) => String(value).padStart(2, "0");

// Si el local acepta pedidos en ese instante: horario, o el override manual si sigue vigente.
function acceptsAt(store, ranges, at) {
  const { override } = store;
  if (override && (!override.until || at < override.until)) return override.mode === "open";
  return ranges.some(([start, end]) => start <= at && at < end);
}

/**
 * Inicios de franja disponibles: desde ahora + la anticipación mínima hasta el último día
 * permitido, alineados a slotMinutes (hora de Brasil) y con el local abierto.
 * @returns {Date[]}
 */
export function availableSlots(store, now = new Date(), timeZone = TIME_ZONE) {
  const { enabled, minLeadMinutes, maxDaysAhead, slotMinutes } = store.scheduling;
  if (!enabled) return [];

  const earliest = now.getTime() + minLeadMinutes * 60_000;
  const ranges = openRanges(store.hours, now, timeZone, maxDaysAhead + 1);
  const today = todayIn(timeZone, now);
  const slots = [];
  for (let day = 0; day <= maxDaysAhead; day++) {
    const date = addDays(today, day);
    for (let minute = 0; minute < 24 * 60; minute += slotMinutes) {
      const at = localToUtc(date, `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`, timeZone);
      if (at.getTime() >= earliest && acceptsAt(store, ranges, at)) slots.push(at);
    }
  }
  return slots;
}

// Valida el horario elegido por el cliente contra las franjas disponibles.
export function checkScheduledTime(store, scheduledFor, now = new Date()) {
  if (!store.scheduling.enabled) {
    throw badRequest("SCHEDULING_NOT_AVAILABLE", "Este estabelecimento não aceita pedidos agendados");
  }
  const valid = availableSlots(store, now).some((slot) => slot.getTime() === scheduledFor.getTime());
  if (!valid) throw badRequest("INVALID_SCHEDULE_TIME", "Esse horário não está disponível. Escolha outro.");
}
