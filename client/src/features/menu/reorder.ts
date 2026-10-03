import { lineKey, type CartLine } from "./cart";
const key = (slug: string) => `serice.last-order.${slug}`;
// Only product choices, no customer details, notes, prices or tracking tokens.
export function rememberOrder(slug: string, lines: CartLine[]) {
  try { localStorage.setItem(key(slug), JSON.stringify(lines.map(({ productId, quantity, options }) => ({ productId, quantity, options })))); } catch { /* Optional storage. */ }
}
export function previousOrder(slug: string): CartLine[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key(slug)) ?? "[]");
    if (!Array.isArray(value) || value.length > 50) return [];
    return value.filter((line) => typeof line?.productId === "string" && Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity <= 50 && Array.isArray(line.options) && line.options.length <= 30 && line.options.every((option: { groupId?: unknown; optionId?: unknown; quantity?: unknown }) => typeof option?.groupId === "string" && typeof option.optionId === "string" && typeof option.quantity === "number" && Number.isInteger(option.quantity) && option.quantity > 0 && option.quantity <= 10))
      .map(({ productId, quantity, options }) => ({ key: lineKey(productId, options, ""), productId, quantity, options, notes: "" }));
  } catch { return []; }
}
