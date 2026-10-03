import mongoose from "mongoose";
import Category from "../models/category.model.js";
import OptionGroup from "../models/optionGroup.model.js";
import Product from "../models/product.model.js";
import { audit } from "../lib/audit.js";
import { parseCsv, toCsv } from "../lib/csv.js";
import { badRequest } from "../lib/errors.js";
import { nextPosition } from "../lib/ordering.js";
import { menuToRows, nameKey, planMenuImport } from "../services/menuImport.service.js";

const byPosition = { position: 1, createdAt: 1 };

const loadMenu = (commerce) =>
  Promise.all([
    Category.find({ commerce }).sort(byPosition).lean(),
    Product.find({ commerce }).sort(byPosition).lean(),
    OptionGroup.find({ commerce }).lean(),
  ]).then(([categories, products, groups]) => ({ categories, products, groups }));

// La planilla del menú, para editarla en Excel y volver a importarla.
export const exportMenu = async (req, res) => {
  const csv = toCsv(menuToRows(await loadMenu(req.commerce._id)));
  res.setHeader("Content-Disposition", `attachment; filename="cardapio-${req.commerce.slug}.csv"`);
  res.type("text/csv; charset=utf-8").send(csv);
};

// Importa una planilla: crea las categorías que no existen y crea o actualiza productos
// (por categoría + nombre). Con dryRun (por defecto) solo muestra qué haría y los errores;
// sin dryRun, aplica todo en una transacción, o nada si hay algún error.
export const importMenu = async (req, res) => {
  const { csv, dryRun } = req.valid.body;
  const commerce = req.commerce._id;
  const menu = await loadMenu(commerce);
  const plan = planMenuImport(parseCsv(csv), menu);
  const summary = {
    categoriesCreated: plan.newCategories.length,
    productsCreated: plan.creates.length,
    productsUpdated: plan.updates.length,
  };

  if (dryRun) return res.json({ dryRun: true, summary, errors: plan.errors });
  if (plan.errors.length) {
    throw badRequest("IMPORT_HAS_ERRORS", "A planilha tem erros. Corrija e tente de novo.", plan.errors);
  }

  await mongoose.connection.transaction(async (session) => {
    const categoryIds = new Map(menu.categories.map((category) => [nameKey(category.name), category._id]));
    let categoryPosition = await nextPosition(Category, { commerce });
    for (const name of plan.newCategories) {
      const [created] = await Category.create([{ commerce, name, position: categoryPosition++ }], { session });
      categoryIds.set(nameKey(name), created._id);
    }

    const positions = new Map();
    for (const { categoryName, fields } of plan.creates) {
      const category = categoryIds.get(nameKey(categoryName));
      const current = positions.get(String(category)) ?? (await nextPosition(Product, { commerce, category }));
      positions.set(String(category), current + 1);
      await Product.create([{ ...fields, commerce, category, position: current }], { session });
    }

    for (const { productId, fields } of plan.updates) {
      await Product.updateOne({ _id: productId, commerce }, { $set: fields }, { session, runValidators: true });
    }
  });

  await audit(req, { action: "menu.imported", entity: { type: "commerce", id: commerce }, changes: summary });
  res.json({ dryRun: false, summary, errors: [] });
};
