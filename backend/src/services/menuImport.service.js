// Import y export del menú en CSV (planilla), para cargarle el menú rápido a un local.
// El import es una función pura que arma un plan (qué crear y qué actualizar) y junta
// todos los errores por línea; el controlador lo aplica solo si no hay errores.
import { PRODUCT_TAGS } from "../models/product.model.js";

export const MAX_IMPORT_ROWS = 1000;

// Columnas de la planilla, en portugués (la usan los dueños).
export const COLUMNS = [
  "categoria",
  "produto",
  "descricao",
  "preco",
  "preco_promocional",
  "disponivel",
  "destaque",
  "grupos",
  "etiquetas",
];
const REQUIRED = ["categoria", "produto", "preco"];

// Etiquetas como las escribe el dueño, y su código en la API.
const TAG_NAMES = {
  vegetariano: "vegetarian",
  vegano: "vegan",
  sem_gluten: "gluten_free",
  picante: "spicy",
  novo: "new",
};
const TAG_LABELS = Object.fromEntries(Object.entries(TAG_NAMES).map(([label, code]) => [code, label]));

// Los nombres se comparan sin mayúsculas ni espacios de los bordes.
export const nameKey = (text) => text.trim().toLocaleLowerCase("pt-BR");
const key = nameKey;

// "25,90", "25.90", "R$ 1.025,90", "25" → centavos. null si no es un precio.
export function parsePrice(text) {
  let value = text.replace(/R\$|\s/g, "");
  if (value === "") return null;
  if (value.includes(",")) value = value.replaceAll(".", "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  return Math.round(Number(value) * 100);
}

export const formatPrice = (cents) => (cents == null ? "" : (cents / 100).toFixed(2).replace(".", ","));

// "sim", "s", "yes", "1", "true" → true; "não", "nao", "n", "no", "0", "false" → false; "" → vacío.
function parseBoolean(text) {
  const value = key(text);
  if (value === "") return undefined;
  if (["sim", "s", "yes", "y", "1", "true", "x"].includes(value)) return true;
  if (["não", "nao", "n", "no", "0", "false"].includes(value)) return false;
  return null;
}

const splitList = (text) =>
  text
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * @param {string[][]} rows   Filas del CSV (la primera es el encabezado).
 * @param {object} menu       { categories, products, groups } actuales del local.
 * @returns {{ errors: {line, message}[], newCategories: string[], creates: object[], updates: object[] }}
 *   creates: { categoryName, fields }; updates: { productId, fields }.
 */
export function planMenuImport(rows, { categories, products, groups }) {
  const errors = [];
  if (!rows.length) return { errors: [{ line: 1, message: "A planilha está vazia" }], newCategories: [], creates: [], updates: [] };

  const header = rows[0].map(key);
  const missing = REQUIRED.filter((column) => !header.includes(column));
  if (missing.length) {
    return {
      errors: [{ line: 1, message: `Faltam as colunas: ${missing.join(", ")}` }],
      newCategories: [],
      creates: [],
      updates: [],
    };
  }
  if (rows.length - 1 > MAX_IMPORT_ROWS) {
    return {
      errors: [{ line: 1, message: `No máximo ${MAX_IMPORT_ROWS} produtos por planilha` }],
      newCategories: [],
      creates: [],
      updates: [],
    };
  }

  const column = (cells, name) => (header.includes(name) ? (cells[header.indexOf(name)] ?? "").trim() : undefined);
  const categoriesByName = new Map(categories.map((c) => [key(c.name), c]));
  const groupsByName = new Map(groups.map((g) => [key(g.name), g]));
  const productsByKey = new Map(products.map((p) => [`${String(p.category)}|${key(p.name)}`, p]));

  const newCategories = [];
  const creates = [];
  const updates = [];
  const seen = new Set();

  rows.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const fail = (message) => errors.push({ line, message });

    const categoryName = column(cells, "categoria");
    const name = column(cells, "produto");
    if (!categoryName) return fail("Falta a categoria");
    if (!name) return fail("Falta o nome do produto");
    if (categoryName.length > 60) return fail("Nome da categoria muito longo (máximo 60)");
    if (name.length > 80) return fail("Nome do produto muito longo (máximo 80)");

    const rowKey = `${key(categoryName)}|${key(name)}`;
    if (seen.has(rowKey)) return fail(`"${name}" aparece duas vezes na categoria "${categoryName}"`);
    seen.add(rowKey);

    const fields = { name };
    const priceCents = parsePrice(column(cells, "preco") ?? "");
    if (priceCents === null) return fail(`Preço inválido: "${column(cells, "preco")}"`);
    fields.priceCents = priceCents;

    const description = column(cells, "descricao");
    if (description !== undefined) {
      if (description.length > 300) return fail("Descrição muito longa (máximo 300)");
      fields.description = description;
    }

    const promo = column(cells, "preco_promocional");
    if (promo !== undefined) {
      if (promo === "") fields.promoPriceCents = null;
      else {
        const promoCents = parsePrice(promo);
        if (promoCents === null) return fail(`Preço promocional inválido: "${promo}"`);
        if (promoCents >= priceCents) return fail("O preço promocional precisa ser menor que o preço");
        fields.promoPriceCents = promoCents;
      }
    }

    for (const [columnName, field] of [
      ["disponivel", "available"],
      ["destaque", "featured"],
    ]) {
      const raw = column(cells, columnName);
      if (raw === undefined) continue;
      const value = parseBoolean(raw);
      if (value === null) return fail(`"${columnName}" tem que ser sim ou não`);
      if (value !== undefined) fields[field] = value;
    }

    const groupNames = column(cells, "grupos");
    if (groupNames !== undefined) {
      const found = splitList(groupNames).map((groupName) => [groupName, groupsByName.get(key(groupName))]);
      const unknown = found.filter(([, group]) => !group).map(([groupName]) => groupName);
      if (unknown.length) return fail(`Grupo de opções não existe: ${unknown.join(", ")}. Crie antes de importar.`);
      fields.optionGroups = found.map(([, group]) => group._id);
    }

    const tagNames = column(cells, "etiquetas");
    if (tagNames !== undefined) {
      const tags = splitList(tagNames).map((tag) => TAG_NAMES[key(tag)] ?? (PRODUCT_TAGS.includes(tag) ? tag : null));
      if (tags.includes(null)) return fail(`Etiqueta inválida. Use: ${Object.keys(TAG_NAMES).join(", ")}`);
      fields.tags = [...new Set(tags)];
    }

    const category = categoriesByName.get(key(categoryName));
    if (!category) {
      if (!newCategories.some((existing) => key(existing) === key(categoryName))) newCategories.push(categoryName);
      creates.push({ categoryName, fields });
      return;
    }
    const existing = productsByKey.get(`${String(category._id)}|${key(name)}`);
    if (existing) updates.push({ productId: existing._id, fields });
    else creates.push({ categoryName: category.name, fields });
  });

  return { errors, newCategories, creates, updates };
}

// Filas del CSV de export: una por producto, en el orden del menú.
export function menuToRows({ categories, products, groups }) {
  const groupNames = new Map(groups.map((g) => [String(g._id), g.name]));
  const rows = [COLUMNS];
  for (const category of categories) {
    for (const product of products.filter((p) => String(p.category) === String(category._id))) {
      rows.push([
        category.name,
        product.name,
        product.description,
        formatPrice(product.priceCents),
        formatPrice(product.promoPriceCents),
        product.available ? "sim" : "não",
        product.featured ? "sim" : "não",
        product.optionGroups.map((id) => groupNames.get(String(id))).filter(Boolean).join(" | "),
        product.tags.map((tag) => TAG_LABELS[tag] ?? tag).join(" | "),
      ]);
    }
  }
  return rows;
}
