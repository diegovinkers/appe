import mongoose from "mongoose";
import Category from "../models/category.model.js";
import OptionGroup from "../models/optionGroup.model.js";
import Product from "../models/product.model.js";
import { notFound } from "../lib/errors.js";
import { availabilityView, optionsNamed } from "../services/availability.service.js";

// Lo que se muestra en Disponibilidade, siempre del local de la sesión.
async function viewOf(commerceId) {
  const [products, categories, groups] = await Promise.all([
    Product.find({ commerce: commerceId }).select("name category available trackStock stock position").lean(),
    Category.find({ commerce: commerceId }).sort({ position: 1 }).select("name").lean(),
    OptionGroup.find({ commerce: commerceId }).select("name options._id options.name options.available").lean(),
  ]);
  return availabilityView({ products, categories, groups });
}

export const getAvailability = async (req, res) => {
  res.json(await viewOf(req.commerce._id));
};

// Agota (o vuelve a ofrecer) una opción en todos los grupos del local que la tienen.
export const setOptionAvailabilityByName = async (req, res) => {
  const { name, available } = req.valid.body;
  const groups = await OptionGroup.find({ commerce: req.commerce._id }).select("options._id options.name").lean();
  const matches = optionsNamed(groups, name);
  if (!matches.length) throw notFound("Opção não encontrada");

  await mongoose.connection.transaction(async (session) => {
    for (const { groupId, optionIds } of matches) {
      await OptionGroup.updateOne(
        { _id: groupId, commerce: req.commerce._id },
        { $set: { "options.$[option].available": available } },
        { arrayFilters: [{ "option._id": { $in: optionIds } }], session }
      );
    }
  });
  res.json(await viewOf(req.commerce._id));
};

// Fin del día (o del problema): todo vuelve a estar disponible. El stock controlado no se toca.
export const restoreAvailability = async (req, res) => {
  const commerce = req.commerce._id;
  await mongoose.connection.transaction(async (session) => {
    await Product.updateMany({ commerce, available: false }, { $set: { available: true } }, { session });
    await OptionGroup.updateMany(
      { commerce, "options.available": false },
      { $set: { "options.$[option].available": true } },
      { arrayFilters: [{ "option.available": false }], session }
    );
  });
  res.json(await viewOf(commerce));
};
