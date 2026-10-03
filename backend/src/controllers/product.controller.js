import Category from "../models/category.model.js";
import OptionGroup from "../models/optionGroup.model.js";
import Product from "../models/product.model.js";
import { audit } from "../lib/audit.js";
import { checkImageUrl } from "../lib/cloudinary.js";
import { badRequest, notFound } from "../lib/errors.js";
import { applyOrder, nextPosition } from "../lib/ordering.js";
import { setTranslations } from "../lib/translations.js";

const productNotFound = () => notFound("Produto não encontrado");

// La categoría y los grupos que llegan en el body tienen que ser del mismo local.
async function checkReferences(commerceId, { category, optionGroups }) {
  if (category && !(await Category.exists({ _id: category, commerce: commerceId }))) {
    throw badRequest("INVALID_CATEGORY", "Categoria não encontrada");
  }
  if (optionGroups?.length) {
    const found = await OptionGroup.countDocuments({ _id: { $in: optionGroups }, commerce: commerceId });
    if (found !== optionGroups.length) {
      throw badRequest("INVALID_OPTION_GROUP", "Grupo de opções não encontrado");
    }
  }
}

// La promoción tiene que ser más barata que el precio y terminar después de empezar.
function checkPromo(product) {
  if (product.promoPriceCents != null && product.promoPriceCents >= product.priceCents) {
    throw badRequest("INVALID_PROMO", "O preço promocional precisa ser menor que o preço normal");
  }
  if (product.promoStartsAt && product.promoEndsAt && product.promoEndsAt <= product.promoStartsAt) {
    throw badRequest("INVALID_PROMO", "A promoção precisa terminar depois de começar");
  }
}

async function findProduct(req) {
  const product = await Product.findOne({ _id: req.valid.params.id, commerce: req.commerce._id });
  if (!product) throw productNotFound();
  return product;
}

const entityOf = (product) => ({ type: "product", id: product._id });
const PRICE_FIELDS = ["priceCents", "promoPriceCents", "promoStartsAt", "promoEndsAt"];

export const listProducts = async (req, res) => {
  const filter = { commerce: req.commerce._id };
  if (req.valid.query.category) filter.category = req.valid.query.category;
  const products = await Product.find(filter).sort({ position: 1, createdAt: 1 });
  res.json({ products });
};

export const getProduct = async (req, res) => {
  res.json({ product: await findProduct(req) });
};

export const createProduct = async (req, res) => {
  const commerce = req.commerce._id;
  const { translations, ...data } = req.valid.body;
  await checkReferences(commerce, data);
  checkImageUrl(data.imageUrl, commerce, "imageUrl");

  const position = data.position ?? (await nextPosition(Product, { commerce, category: data.category }));
  const product = new Product({ ...data, position, commerce });
  setTranslations(product, translations);
  checkPromo(product);
  await product.save();

  await audit(req, {
    action: "product.created",
    entity: entityOf(product),
    changes: { name: product.name, priceCents: product.priceCents },
  });
  res.status(201).json({ product });
};

export const updateProduct = async (req, res) => {
  const { translations, ...changes } = req.valid.body;
  await checkReferences(req.commerce._id, changes);
  checkImageUrl(changes.imageUrl, req.commerce._id, "imageUrl");

  const product = await findProduct(req);
  const before = Object.fromEntries(PRICE_FIELDS.map((field) => [field, product[field]]));
  product.set(changes);
  setTranslations(product, translations);
  checkPromo(product);
  await product.save();

  // Se audita cualquier cambio de precio, incluida la promoción.
  const priceChanges = Object.fromEntries(
    PRICE_FIELDS.filter((field) => String(before[field]) !== String(product[field])).map((field) => [
      field,
      [before[field], product[field]],
    ])
  );
  if (Object.keys(priceChanges).length) {
    await audit(req, {
      action: "product.price_changed",
      entity: entityOf(product),
      changes: { name: product.name, ...priceChanges },
    });
  }
  res.json({ product });
};

// Marcar agotado o disponible. También lo puede hacer un empleado.
export const setProductAvailability = async (req, res) => {
  const product = await findProduct(req);
  product.available = req.valid.body.available;
  await product.save();
  res.json({ product });
};

// Copia el producto al final de su categoría, para cargar variantes rápido.
export const duplicateProduct = async (req, res) => {
  const original = await findProduct(req);
  const { _id, createdAt, updatedAt, ...data } = original.toObject();
  const copy = await Product.create({
    ...data,
    name: `${original.name} (cópia)`.slice(0, 80),
    // Con stock controlado, la copia arranca en 0: nadie contó esas unidades todavía.
    stock: 0,
    position: await nextPosition(Product, { commerce: req.commerce._id, category: original.category }),
  });
  await audit(req, {
    action: "product.created",
    entity: entityOf(copy),
    changes: { name: copy.name, priceCents: copy.priceCents, copiedFrom: original._id },
  });
  res.status(201).json({ product: copy });
};

export const deleteProduct = async (req, res) => {
  const product = await findProduct(req);
  await product.deleteOne();
  await audit(req, { action: "product.deleted", entity: entityOf(product), changes: { name: product.name } });
  res.status(204).end();
};

// Ordena los productos de una categoría.
export const reorderProducts = async (req, res) => {
  const commerce = req.commerce._id;
  const { category, ids } = req.valid.body;
  await checkReferences(commerce, { category });
  await applyOrder(Product, { commerce, category }, ids);

  const products = await Product.find({ commerce, category }).sort({ position: 1, createdAt: 1 });
  res.json({ products });
};
