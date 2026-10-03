import type { Opening, OwnerStore } from "../../api/types";
import { getT } from "../../i18n";
import { formatTime, formatWhen } from "../../lib/format";

export type StatusChange = { mode: "open" | "closed" | "auto" } | { mode: "paused"; minutes: number };
export type StatusAction = { key: string; label: string; change: StatusChange };

// Cómo se muestra el cartel: texto, detalle ("até 23:30") y color.
// Sirve para el panel y para el menú público (que recibe solo estos campos).
export function statusView(opening: Pick<Opening, "status" | "closesAt" | "pausedUntil" | "nextOpenAt">, now = new Date()) {
  const t = getT();
  if (opening.status === "open") {
    return {
      label: t.status.open,
      detail: opening.closesAt ? t.status.until(formatTime(opening.closesAt)) : null,
      tone: "bg-open",
    };
  }
  if (opening.status === "paused") {
    return {
      label: t.status.paused,
      detail: opening.pausedUntil ? t.status.backAt(formatTime(opening.pausedUntil)) : null,
      tone: "bg-paused",
    };
  }
  return {
    label: t.status.closed,
    detail: opening.nextOpenAt ? t.status.opens(formatWhen(opening.nextOpenAt, now)) : null,
    tone: "bg-closed",
  };
}

// Qué se puede hacer desde el estado actual. "Retomar" y "volver al horario" usan el
// horario si el local lo tiene cargado; si no, abren a mano.
export function statusActions(store: Pick<OwnerStore, "hours" | "override">, opening: Opening): StatusAction[] {
  const t = getT();
  const hasSchedule = Object.values(store.hours.weekly).some((intervals) => intervals.length > 0);
  const actions: StatusAction[] = [];

  if (opening.status === "open") {
    for (const { minutes, label } of t.status.pauseOptions) {
      actions.push({ key: `pause-${minutes}`, label: t.status.pause(label), change: { mode: "paused", minutes } });
    }
    actions.push({ key: "close", label: t.status.closeNow, change: { mode: "closed" } });
  } else if (opening.status === "paused") {
    actions.push({ key: "resume", label: t.status.resume, change: { mode: hasSchedule ? "auto" : "open" } });
    actions.push({ key: "close", label: t.status.closeNow, change: { mode: "closed" } });
  } else {
    actions.push({ key: "open", label: t.status.openNow, change: { mode: "open" } });
  }

  if (store.override && hasSchedule && opening.status !== "paused") {
    actions.push({ key: "auto", label: t.status.backToSchedule, change: { mode: "auto" } });
  }
  return actions;
}
