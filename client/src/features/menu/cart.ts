import { useSyncExternalStore } from "react";
import type { ChosenOption } from "./pricing";

// El carrito de cada local queda en el aparato: si se cierra la pestaña o se corta la
// conexión, al volver sigue ahí. Guarda qué se eligió, no los precios: esos salen del
// menú del momento.
export type CartLine = { key: string; productId: string; quantity: number; options: ChosenOption[]; notes: string };

const storageKey = (slug: string) => `sacola.${slug}`;
const carts = new Map<string, CartLine[]>();
const listeners = new Set<() => void>();

const isLine = (value: unknown): value is CartLine => {
  const line = value as CartLine;
  return (
    typeof line?.key === "string" &&
    typeof line.productId === "string" &&
    Number.isInteger(line.quantity) &&
    line.quantity > 0 &&
    Array.isArray(line.options) &&
    typeof line.notes === "string"
  );
};

function read(slug: string): CartLine[] {
  let lines = carts.get(slug);
  if (lines) return lines;
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey(slug)) ?? "[]");
    lines = Array.isArray(saved) ? saved.filter(isLine) : [];
  } catch {
    lines = [];
  }
  carts.set(slug, lines);
  return lines;
}

function write(slug: string, lines: CartLine[]) {
  carts.set(slug, lines);
  try {
    if (lines.length) localStorage.setItem(storageKey(slug), JSON.stringify(lines));
    else localStorage.removeItem(storageKey(slug));
  } catch {
    // Sin almacenamiento, el carrito dura mientras la página esté abierta.
  }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// Mismo producto, mismas opciones y misma observación: es la misma línea (se suma la cantidad).
export const lineKey = (productId: string, options: ChosenOption[], notes: string) =>
  JSON.stringify([productId, [...options].sort((a, b) => a.optionId.localeCompare(b.optionId)), notes.trim()]);

export function useCart(slug: string) {
  const lines = useSyncExternalStore(subscribe, () => read(slug), () => read(slug));
  return {
    lines,
    add(productId: string, quantity: number, options: ChosenOption[], notes: string) {
      const key = lineKey(productId, options, notes);
      const current = read(slug);
      const existing = current.find((line) => line.key === key);
      write(
        slug,
        existing
          ? current.map((line) => (line.key === key ? { ...line, quantity: line.quantity + quantity } : line))
          : [...current, { key, productId, quantity, options, notes: notes.trim() }]
      );
    },
    setQuantity(key: string, quantity: number) {
      const current = read(slug);
      write(slug, quantity > 0 ? current.map((line) => (line.key === key ? { ...line, quantity } : line)) : current.filter((line) => line.key !== key));
    },
    clear: () => write(slug, []),
  };
}
