import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { OwnerStoreResponse } from "../../api/types";

export const ownerStoreKey = ["owner-store"] as const;

// El local del usuario, con su estado de apertura. Se refresca cada minuto porque el
// estado cambia solo con el horario (abre, cierra, vence una pausa).
export const useOwnerStore = () =>
  useQuery({
    queryKey: ownerStoreKey,
    queryFn: () => api<OwnerStoreResponse>("/owner/store"),
    refetchInterval: 60_000,
  });
