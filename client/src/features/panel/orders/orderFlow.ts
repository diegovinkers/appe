import type { Order, OrderStatus } from "../../../api/types";
import type { Dictionary } from "../../../i18n";

// El camino de un pedido: el mismo que acepta el backend (src/services/orderStatus.js).
export const ACTIVE: OrderStatus[] = ["new", "confirmed", "ready", "out_for_delivery"];
export const isActive = (status: OrderStatus) => ACTIVE.includes(status);

export function nextStatus(order: Pick<Order, "status" | "fulfillment">): OrderStatus | null {
  switch (order.status) {
    case "new":
      return "confirmed";
    case "confirmed":
      return "ready";
    case "ready":
      return order.fulfillment === "delivery" ? "out_for_delivery" : "delivered";
    case "out_for_delivery":
      return "delivered";
    default:
      return null;
  }
}

// El texto del botón que lleva al estado siguiente.
export function nextLabel(order: Pick<Order, "status" | "fulfillment">, t: Dictionary): string | null {
  const next = t.orders.next;
  switch (order.status) {
    case "new":
      return next.new;
    case "confirmed":
      return next.confirmed;
    case "ready":
      return order.fulfillment === "delivery" ? next.readyDelivery : next.readyPickup;
    case "out_for_delivery":
      return next.out_for_delivery;
    default:
      return null;
  }
}

export type OrderFilter = "active" | "new" | "done" | "all";
export const ORDER_FILTERS: OrderFilter[] = ["active", "new", "done", "all"];

export function matchesFilter(status: OrderStatus, filter: OrderFilter) {
  if (filter === "all") return true;
  if (filter === "new") return status === "new";
  return filter === "active" ? isActive(status) : !isActive(status);
}

export const STATUS_TONE: Record<OrderStatus, string> = {
  new: "bg-[#fff4d6] text-[#7a4e00] ring-[#f0d48a]",
  confirmed: "bg-[#e3eefc] text-[#1d4f91] ring-[#b9d1f3]",
  ready: "bg-[#e3f4ea] text-[#16603b] ring-[#b4dcc4]",
  out_for_delivery: "bg-[#ece8fb] text-[#4a3a8c] ring-[#cfc6f0]",
  delivered: "bg-paper text-ink-muted ring-line",
  cancelled: "bg-paper text-closed ring-line line-through",
};
