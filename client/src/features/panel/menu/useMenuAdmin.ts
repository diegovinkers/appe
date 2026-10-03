import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ApiError, api } from "../../../api/client";
import type { Category, OptionGroup, Product } from "../../../api/types";

// Lo que el panel usa para administrar el menú. Cada cambio refresca estas listas y el
// menú público (el comprador ve el cambio al instante).
const KEYS = { categories: ["owner-categories"], products: ["owner-products"], groups: ["owner-option-groups"] };

export const useCategories = () =>
  useQuery({ queryKey: KEYS.categories, queryFn: () => api<{ categories: Category[] }>("/owner/categories").then((data) => data.categories) });

export const useProducts = () =>
  useQuery({ queryKey: KEYS.products, queryFn: () => api<{ products: Product[] }>("/owner/products").then((data) => data.products) });

export const useOptionGroups = () =>
  useQuery({
    queryKey: KEYS.groups,
    queryFn: () => api<{ optionGroups: OptionGroup[] }>("/owner/option-groups").then((data) => data.optionGroups),
  });

type Method = "POST" | "PATCH" | "DELETE";

// Un cambio del menú: { path, method, body } → refresca todo lo del menú al terminar.
export function useMenuChange<Result = unknown>() {
  const queryClient = useQueryClient();
  return useMutation<Result, ApiError, { path: string; method: Method; body?: unknown }>({
    mutationFn: ({ path, method, body }) => api<Result>(path, { method, body }),
    onSuccess: () => {
      for (const key of Object.values(KEYS)) queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ["public-store"] });
    },
  });
}

// Mueve un elemento una posición arriba (-1) o abajo (+1) y devuelve los ids en el orden nuevo.
export function moved<T extends { _id: string }>(list: T[], id: string, step: -1 | 1): string[] | null {
  const ids = list.map((item) => item._id);
  const from = ids.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  return ids;
}
