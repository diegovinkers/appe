// Salón: el estado de cada mesa y el lugar libre para una mesa nueva. Funciones puras.
import { GRID_COLUMNS, GRID_ROWS } from "../models/table.model.js";

// free: sin cuenta. occupied: con cuenta y nada en cocina. kitchen: pedidos en preparación.
// ready: algún pedido listo para servir. bill: pidió la cuenta (lo más urgente para el mozo).
export const TABLE_STATES = ["free", "occupied", "kitchen", "ready", "bill"];

export function tableState(tab, orders = []) {
  if (!tab) return "free";
  if (tab.status === "bill_requested") return "bill";
  if (orders.some((order) => order.status === "ready")) return "ready";
  if (orders.some((order) => order.status === "new" || order.status === "confirmed")) return "kitchen";
  return "occupied";
}

// Lo que se cobra: los pedidos no cancelados de la cuenta.
export const tabTotal = (orders) => orders.filter((order) => order.status !== "cancelled").reduce((sum, order) => sum + order.totalCents, 0);

// Primera celda libre, de izquierda a derecha y de arriba abajo, dejando una celda de aire
// entre mesas: así las mesas nuevas quedan ordenadas sin que nadie las acomode.
export function freeCell(tables, columns = 6) {
  const taken = new Set(tables.map((table) => `${table.x},${table.y}`));
  for (let row = 0; row < GRID_ROWS; row += 2) {
    for (let column = 0; column < Math.min(columns * 2, GRID_COLUMNS); column += 2) {
      if (!taken.has(`${column},${row}`)) return { x: column, y: row };
    }
  }
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let column = 0; column < GRID_COLUMNS; column++) if (!taken.has(`${column},${row}`)) return { x: column, y: row };
  }
  return null;
}
