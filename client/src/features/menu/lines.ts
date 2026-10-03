import type { PublicCategory, PublicProduct } from "../../api/types";
import type { CartLine } from "./cart";
import { type Groups, unitPrice, unmetGroups } from "./pricing";

export type MenuIndex = Map<string, { product: PublicProduct; category: PublicCategory }>;

export type ResolvedLine = {
  line: CartLine;
  product: PublicProduct | null;
  // "2x Bacon, Ao ponto": lo elegido, en el orden de los grupos.
  optionsText: string;
  unitCents: number;
  totalCents: number;
  // Si se puede pedir ahora: el producto sigue en el menú, disponible, y las opciones también.
  available: boolean;
};

export const indexMenu = (categories: PublicCategory[]): MenuIndex =>
  new Map(categories.flatMap((category) => category.products.map((product) => [product._id, { product, category }] as const)));

// Cada línea del carrito con el precio y la disponibilidad del menú de ahora.
export function resolveLines(lines: CartLine[], menu: MenuIndex, groups: Groups): ResolvedLine[] {
  return lines.map((line) => {
    const entry = menu.get(line.productId);
    if (!entry) return { line, product: null, optionsText: "", unitCents: 0, totalCents: 0, available: false };

    const { product, category } = entry;
    const picked = line.options.map((pick) => ({ pick, option: groups.get(pick.groupId)?.options.find((o) => o._id === pick.optionId) }));
    const optionsText = product.optionGroups
      .flatMap((groupId) => picked.filter(({ pick }) => pick.groupId === groupId))
      .map(({ pick, option }) => (option ? `${pick.quantity > 1 ? `${pick.quantity}x ` : ""}${option.name}` : ""))
      .filter(Boolean)
      .join(", ");
    const available =
      product.available &&
      category.availableNow &&
      Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity <= 50 &&
      product.optionGroups.every((id) => groups.has(id)) &&
      new Set(line.options.map((pick) => `${pick.groupId}/${pick.optionId}`)).size === line.options.length &&
      picked.every(({ pick, option }) => product.optionGroups.includes(pick.groupId) && option?.available && Number.isInteger(pick.quantity) && pick.quantity > 0 && pick.quantity <= option.maxQuantity) &&
      unmetGroups(product, groups, line.options).length === 0;
    const unitCents = unitPrice(product, groups, line.options);
    return { line, product, optionsText, unitCents, totalCents: unitCents * line.quantity, available };
  });
}
