import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { PublicStore, SlotsResponse } from "../../api/types";
import { operatingDayISO } from "../../lib/format";

// Se puede armar un pedido: el local está abierto, o está cerrado pero acepta pedidos
// programados (el comprador elige el horario al finalizar).
export const canOrderNow = (store: Pick<PublicStore, "isOpen" | "scheduling">) => store.isOpen || store.scheduling.enabled;

// Los horarios que se pueden programar ahora (los calcula el servidor con el horario del local).
export const useSlots = (slug: string, enabled: boolean) =>
  useQuery({
    queryKey: ["public-slots", slug],
    queryFn: () => api<SlotsResponse>(`/public/stores/${encodeURIComponent(slug)}/slots`),
    enabled,
    staleTime: 60_000,
  });

// Los horarios agrupados por día de calendario en Brasil, en orden.
export function slotsByDay(slots: string[]): { day: string; slots: string[] }[] {
  const days: { day: string; slots: string[] }[] = [];
  for (const slot of slots) {
    const day = operatingDayISO(new Date(slot), "00:00");
    const last = days.at(-1);
    if (last?.day === day) last.slots.push(slot);
    else days.push({ day, slots: [slot] });
  }
  return days;
}
