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

// Cuántos minutos puede esperar un pedido nuevo sin que nadie lo acepte antes de marcarlo.
export const ACCEPT_WITHIN_MINUTES = 5;

type TimedOrder = Pick<Order, "status" | "fulfillment" | "createdAt" | "scheduledFor" | "estimatedMinutes" | "statusHistory">;

// Cómo va de tiempo un pedido, para la lista:
// - waiting: nuevo, sin aceptar (late si pasó ACCEPT_WITHIN_MINUTES).
// - late: pasó la hora prometida (la programada, o la confirmación + el tiempo estimado máximo).
// - ready: listo para retirar, esperando al cliente (no es atraso del local).
// - onTime: en preparación o en camino, dentro del tiempo. - done: entregado o cancelado.
export type OrderTiming = { kind: "waiting" | "late" | "ready" | "onTime" | "done"; minutes: number; late: boolean; dueAt: number | null };

const minutesBetween = (from: number, to: number) => Math.max(0, Math.floor((to - from) / 60_000));
const reachedAt = (order: TimedOrder, status: OrderStatus) => order.statusHistory.find((entry) => entry.status === status)?.at;

export function dueAt(order: TimedOrder): number | null {
  if (order.scheduledFor) return Date.parse(order.scheduledFor);
  if (order.estimatedMinutes?.max == null) return null;
  const base = Date.parse(reachedAt(order, "confirmed") ?? order.createdAt);
  return base + order.estimatedMinutes.max * 60_000;
}

export function orderTiming(order: TimedOrder, now = Date.now()): OrderTiming {
  const createdAt = Date.parse(order.createdAt);
  if (!isActive(order.status)) return { kind: "done", minutes: minutesBetween(createdAt, now), late: false, dueAt: null };
  if (order.status === "new") {
    const minutes = minutesBetween(createdAt, now);
    return { kind: "waiting", minutes, late: minutes >= ACCEPT_WITHIN_MINUTES, dueAt: dueAt(order) };
  }
  if (order.status === "ready" && order.fulfillment === "pickup") {
    const readyAt = Date.parse(reachedAt(order, "ready") ?? order.createdAt);
    return { kind: "ready", minutes: minutesBetween(readyAt, now), late: false, dueAt: null };
  }
  const due = dueAt(order);
  // Atrasado desde el primer minuto entero: "Atrasado 0 min" no le dice nada a nadie.
  if (due != null && now - due >= 60_000) return { kind: "late", minutes: minutesBetween(due, now), late: true, dueAt: due };
  return { kind: "onTime", minutes: minutesBetween(createdAt, now), late: false, dueAt: due };
}

// Orden de la lista de pedidos en curso: primero los nuevos (el más viejo arriba), después
// los demás por la hora en que tienen que salir (los atrasados quedan arriba solos).
export function byUrgency(now = Date.now()) {
  const rank = (order: TimedOrder & { createdAt: string }) => {
    if (order.status === "new") return [0, Date.parse(order.createdAt)];
    if (!isActive(order.status)) return [2, -Date.parse(order.createdAt)];
    return [1, orderTiming(order, now).dueAt ?? Date.parse(order.createdAt)];
  };
  return (a: TimedOrder, b: TimedOrder) => {
    const [groupA, valueA] = rank(a);
    const [groupB, valueB] = rank(b);
    return groupA - groupB || valueA - valueB;
  };
}

export const STATUS_TONE: Record<OrderStatus, string> = {
  new: "bg-[#fff4d6] text-[#7a4e00] ring-[#f0d48a]",
  confirmed: "bg-[#e3eefc] text-[#1d4f91] ring-[#b9d1f3]",
  ready: "bg-[#e3f4ea] text-[#16603b] ring-[#b4dcc4]",
  out_for_delivery: "bg-[#ece8fb] text-[#4a3a8c] ring-[#cfc6f0]",
  delivered: "bg-paper text-ink-muted ring-line",
  cancelled: "bg-paper text-closed ring-line line-through",
};
