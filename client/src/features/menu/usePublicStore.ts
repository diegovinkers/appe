import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { PublicStoreResponse } from "../../api/types";
import { useLanguage } from "../../i18n";

// El local y su menú entero, en el idioma elegido (el backend usa "pt" o "es").
// Se refresca cada minuto: así el estado abierto/cerrado y lo agotado no quedan viejos.
export function usePublicStore(slug: string) {
  const lang = useLanguage() === "es" ? "es" : "pt";
  return useQuery({
    queryKey: ["public-store", slug, lang],
    queryFn: () => api<PublicStoreResponse>(`/public/stores/${encodeURIComponent(slug)}?lang=${lang}`),
    refetchInterval: 60_000,
    // Al cambiar de idioma se sigue viendo el menú mientras llega el nuevo.
    placeholderData: keepPreviousData,
  });
}
