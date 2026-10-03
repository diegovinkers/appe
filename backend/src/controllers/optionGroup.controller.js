import OptionGroup from "../models/optionGroup.model.js";
import Product from "../models/product.model.js";
import { audit } from "../lib/audit.js";
import { badRequest, notFound } from "../lib/errors.js";
import { setTranslations } from "../lib/translations.js";

const groupNotFound = () => notFound("Grupo de opções não encontrado");

function checkLimits({ minSelect, maxSelect, options }) {
  if (minSelect > maxSelect) {
    throw badRequest("INVALID_LIMITS", "O mínimo não pode ser maior que o máximo");
  }
  // Con cantidades por opción ("2x bacon"), el máximo se compara contra las unidades posibles.
  const units = options.reduce((sum, option) => sum + (option.maxQuantity ?? 1), 0);
  if (maxSelect > units) {
    throw badRequest("INVALID_LIMITS", "O máximo não pode ser maior que a quantidade de opções");
  }
}

const findGroup = async (req) => {
  const group = await OptionGroup.findOne({ _id: req.valid.params.id, commerce: req.commerce._id });
  if (!group) throw groupNotFound();
  return group;
};

export const listOptionGroups = async (req, res) => {
  const optionGroups = await OptionGroup.find({ commerce: req.commerce._id }).sort({ name: 1 });
  res.json({ optionGroups });
};

export const getOptionGroup = async (req, res) => {
  res.json({ optionGroup: await findGroup(req) });
};

export const createOptionGroup = async (req, res) => {
  const data = { minSelect: 0, maxSelect: 1, ...req.valid.body };
  checkLimits(data);
  // Las opciones nuevas siempre reciben un _id nuevo.
  const options = data.options.map(({ _id, ...option }) => option);
  const optionGroup = await OptionGroup.create({ ...data, options, commerce: req.commerce._id });
  res.status(201).json({ optionGroup });
};

// `options` reemplaza la lista entera. Las que vienen con _id conservan su id.
export const updateOptionGroup = async (req, res) => {
  const group = await findGroup(req);
  const { translations, ...changes } = req.valid.body;

  if (changes.options) {
    const current = new Set(group.options.map((option) => String(option._id)));
    const kept = changes.options.filter((option) => option._id).map((option) => option._id);
    if (kept.some((id) => !current.has(id)) || new Set(kept).size !== kept.length) {
      throw badRequest("INVALID_OPTION", "Opção inválida");
    }
  }

  const previousPrices = new Map(group.options.map((option) => [String(option._id), option.priceCents]));
  group.set(changes);
  setTranslations(group, translations);
  checkLimits(group);
  await group.save();

  // Solo se audita si cambió algún precio: de una opción que ya estaba, o una nueva que cobra.
  const priceChanged = (option) => {
    const previous = previousPrices.get(String(option._id));
    return previous === undefined ? option.priceCents > 0 : previous !== option.priceCents;
  };
  const priceChanges = group.options
    .filter(priceChanged)
    .map((option) => ({ option: option.name, priceCents: [previousPrices.get(String(option._id)) ?? null, option.priceCents] }));
  if (priceChanges.length) {
    await audit(req, {
      action: "option_group.prices_changed",
      entity: { type: "option_group", id: group._id },
      changes: { name: group.name, options: priceChanges },
    });
  }
  res.json({ optionGroup: group });
};

// Borrar un grupo lo saca de los productos que lo usaban.
export const deleteOptionGroup = async (req, res) => {
  const group = await findGroup(req);
  await Product.updateMany({ commerce: req.commerce._id, optionGroups: group._id }, { $pull: { optionGroups: group._id } });
  await group.deleteOne();
  await audit(req, {
    action: "option_group.deleted",
    entity: { type: "option_group", id: group._id },
    changes: { name: group.name },
  });
  res.status(204).end();
};

// Marcar una opción agotada la apaga en todos los productos del local.
export const setOptionAvailability = async (req, res) => {
  const { id, optionId } = req.valid.params;
  const optionGroup = await OptionGroup.findOneAndUpdate(
    { _id: id, commerce: req.commerce._id, "options._id": optionId },
    { $set: { "options.$.available": req.valid.body.available } },
    { returnDocument: "after" }
  );
  if (!optionGroup) throw notFound("Opção não encontrada");
  res.json({ optionGroup });
};
