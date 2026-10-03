import Category from "../models/category.model.js";
import Product from "../models/product.model.js";
import { audit } from "../lib/audit.js";
import { conflict, notFound } from "../lib/errors.js";
import { applyOrder, nextPosition } from "../lib/ordering.js";
import { translationPaths } from "../lib/translations.js";

const categoryNotFound = () => notFound("Categoria não encontrada");

const listFor = (commerceId) => Category.find({ commerce: commerceId }).sort({ position: 1, createdAt: 1 });

export const listCategories = async (req, res) => {
  res.json({ categories: await listFor(req.commerce._id) });
};

export const createCategory = async (req, res) => {
  const commerce = req.commerce._id;
  const data = req.valid.body;
  const position = data.position ?? (await nextPosition(Category, { commerce }));
  const category = await Category.create({ ...data, position, commerce });
  res.status(201).json({ category });
};

export const updateCategory = async (req, res) => {
  const { translations, ...changes } = req.valid.body;
  const category = await Category.findOneAndUpdate(
    { _id: req.valid.params.id, commerce: req.commerce._id },
    { $set: { ...changes, ...translationPaths(translations) } },
    { returnDocument: "after", runValidators: true }
  );
  if (!category) throw categoryNotFound();
  res.json({ category });
};

export const deleteCategory = async (req, res) => {
  const category = await Category.findOne({ _id: req.valid.params.id, commerce: req.commerce._id });
  if (!category) throw categoryNotFound();
  if (await Product.exists({ commerce: req.commerce._id, category: category._id })) {
    throw conflict("CATEGORY_NOT_EMPTY", "Mova ou apague os produtos desta categoria antes de apagá-la");
  }
  await category.deleteOne();
  await audit(req, {
    action: "category.deleted",
    entity: { type: "category", id: category._id },
    changes: { name: category.name },
  });
  res.status(204).end();
};

export const reorderCategories = async (req, res) => {
  await applyOrder(Category, { commerce: req.commerce._id }, req.valid.body.ids);
  res.json({ categories: await listFor(req.commerce._id) });
};
