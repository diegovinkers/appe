import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ApiError, api } from "../../../api/client";
import type { Order, OrderResponse, OrdersResponse, OrderStatus } from "../../../api/types";

export const ordersKey = (day: string) => ["orders", day];

// Los pedidos de un día. El de hoy se actualiza cada 10 segundos.
export function useOrders(day: string, isToday: boolean) {
  return useQuery({
    queryKey: ordersKey(day),
    queryFn: () => api<OrdersResponse>(`/owner/orders${isToday ? "" : `?date=${day}`}`),
    refetchInterval: isToday ? 10_000 : false,
  });
}

// Un pedido que no está en la lista que se ve (link directo a otro día): se pide aparte.
export function useOrder(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["order", id],
    queryFn: () => api<OrderResponse>(`/owner/orders/${id}`).then((data) => data.order),
    enabled,
  });
}

// Después de un cambio, el pedido nuevo reemplaza al viejo en todas las listas.
function replaceOrder(queryClient: QueryClient, order: Order) {
  queryClient.setQueriesData<OrdersResponse>({ queryKey: ["orders"] }, (data) =>
    data ? { ...data, orders: data.orders.map((item) => (item._id === order._id ? order : item)) } : data
  );
  queryClient.setQueryData(["order", order._id], order);
}

export function useChangeStatus() {
  const queryClient = useQueryClient();
  return useMutation<OrderResponse, ApiError, { id: string; status: OrderStatus; reason?: string }>({
    mutationFn: ({ id, ...body }) => api<OrderResponse>(`/owner/orders/${id}/status`, { method: "PATCH", body }),
    onSuccess: ({ order }) => replaceOrder(queryClient, order),
    // Otro aparato ya lo cambió: se trae la lista de nuevo.
    onError: (error) => {
      if (error.code === "INVALID_STATUS_TRANSITION") queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export function useSaveNotes() {
  const queryClient = useQueryClient();
  return useMutation<OrderResponse, ApiError, { id: string; internalNotes: string }>({
    mutationFn: ({ id, internalNotes }) => api<OrderResponse>(`/owner/orders/${id}/notes`, { method: "PATCH", body: { internalNotes } }),
    onSuccess: ({ order }) => replaceOrder(queryClient, order),
  });
}
