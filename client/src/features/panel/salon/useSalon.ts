import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ApiError, api } from "../../../api/client";
import type { SalonTable, TableTabResponse, TablesResponse } from "../../../api/types";

export const tablesKey = ["tables"];
export const tableTabKey = (id: string) => ["tables", id, "tab"];

export type TableState = SalonTable["state"];
// Del más urgente al más tranquilo: así se ordena la lista de mesas ocupadas.
export const STATE_ORDER: TableState[] = ["bill", "ready", "kitchen", "occupied", "free"];

// El color de cada estado. Lleno = alguien tiene que ir a la mesa (servir o cobrar);
// clarito = la mesa está atendida; punteado = libre.
export const STATE_TONE: Record<TableState, string> = {
  free: "border-dashed border-ink-muted/50 bg-surface text-ink-muted",
  occupied: "border-[#1d4f91] bg-[#e3eefc] text-[#1d4f91]",
  kitchen: "border-[#b07a12] bg-[#fff4d6] text-[#7a4e00]",
  ready: "border-[#16794a] bg-[#16794a] text-white",
  bill: "border-[#8e3b34] bg-[#8e3b34] text-white",
};
// La muestra de la leyenda (mismo color que la mesa, en chico).
export const STATE_SWATCH: Record<TableState, string> = {
  free: "border-2 border-dashed border-ink-muted/60",
  occupied: "border-2 border-[#1d4f91] bg-[#e3eefc]",
  kitchen: "border-2 border-[#b07a12] bg-[#fff4d6]",
  ready: "bg-[#16794a]",
  bill: "bg-[#8e3b34]",
};

// Las mesas con su estado. Hoy se actualiza cada 10 segundos, como los pedidos.
// Si el servidor todavía no tiene mesas (versión vieja), no hay salón y listo.
export function useSalonTables() {
  return useQuery({
    queryKey: tablesKey,
    queryFn: () => api<TablesResponse>("/owner/tables"),
    refetchInterval: 10_000,
    retry: 1,
  });
}

export function useTableTab(id: string) {
  return useQuery({
    queryKey: tableTabKey(id),
    queryFn: () => api<TableTabResponse>(`/owner/tables/${id}/tab`),
    refetchInterval: 10_000,
  });
}

// Cualquier cambio en una cuenta cambia el salón y la lista de pedidos.
export function useTabAction<Vars, Result = unknown>(request: (vars: Vars) => Promise<Result>) {
  const queryClient = useQueryClient();
  return useMutation<Result, ApiError, Vars>({
    mutationFn: request,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tablesKey });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export const tabRequest = <T = unknown>(tabId: string, action: "bill" | "move" | "close" | "service-fee", body: object = {}) =>
  api<T>(`/owner/tabs/${tabId}/${action}`, { method: "POST", body });

// Si el local tiene mesas activas (para mostrar "Mesas" en la barra del celular). Usa la misma
// lista que el salón, sin pedirla a cada rato.
export function useHasTables() {
  const query = useQuery({ queryKey: tablesKey, queryFn: () => api<TablesResponse>("/owner/tables"), staleTime: 60_000, retry: 1 });
  return Boolean(query.data?.tables.some((table) => table.active));
}
