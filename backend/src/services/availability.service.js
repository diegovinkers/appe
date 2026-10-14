// Disponibilidade: lo que el local tiene en falta, en una sola lista. Las opciones se juntan
// por nombre (sin mayúsculas ni acentos): "Queijo" en tres grupos es un solo interruptor.
// Funciones puras: reciben los documentos ya cargados.

export const optionKey = (name) =>
  String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * @param {object[]} products  Productos del local (con category poblada o su id).
 * @param {object[]} categories Categorías del local.
 * @param {object[]} groups     Grupos de opciones del local.
 */
export function availabilityView({ products, categories, groups }) {
  const categoryNames = new Map(categories.map((category) => [String(category._id), category.name]));
  const categoryOrder = new Map(categories.map((category, index) => [String(category._id), index]));

  const items = [...products]
    .sort(
      (a, b) =>
        (categoryOrder.get(String(a.category)) ?? 0) - (categoryOrder.get(String(b.category)) ?? 0) || (a.position ?? 0) - (b.position ?? 0)
    )
    .map((product) => ({
      _id: String(product._id),
      name: product.name,
      category: categoryNames.get(String(product.category)) ?? "",
      available: product.available,
      // Con stock controlado en 0 está agotado aunque el interruptor diga disponible.
      soldOut: Boolean(product.trackStock && product.stock <= 0),
    }));

  const options = new Map();
  for (const group of groups) {
    for (const option of group.options) {
      const key = optionKey(option.name);
      if (!key) continue;
      const entry = options.get(key) ?? { key, name: option.name, available: true, unavailable: 0, groups: [] };
      entry.groups.push({ groupId: String(group._id), group: group.name, optionId: String(option._id), available: option.available });
      if (!option.available) {
        entry.available = false;
        entry.unavailable += 1;
      }
      options.set(key, entry);
    }
  }

  return {
    products: items,
    options: [...options.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
  };
}

// Los grupos y las opciones que hay que cambiar para marcar `name` en todos los grupos.
export function optionsNamed(groups, name) {
  const key = optionKey(name);
  return groups
    .map((group) => ({ groupId: group._id, optionIds: group.options.filter((option) => optionKey(option.name) === key).map((option) => option._id) }))
    .filter((match) => match.optionIds.length > 0);
}
