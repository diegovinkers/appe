import { z } from "zod";
import { PRICING_RULES } from "../models/optionGroup.model.js";
import { PRODUCT_TAGS } from "../models/product.model.js";
import { WEEKDAYS } from "../services/opening.service.js";
import {
  cents,
  closingTime,
  dateTime,
  imageUrl,
  objectId,
  optionalText,
  requiredText,
  time,
  translation,
} from "./common.schema.js";

const notEmpty = (changes) => Object.keys(changes).length > 0;
const unique = (list) => new Set(list).size === list.length;
const position = z.number().int().min(0).max(10_000);

export const reorderSchema = z.object({
  ids: z.array(objectId).min(1).max(500).refine(unique, "ID repetido"),
});

export const reorderProductsSchema = reorderSchema.extend({ category: objectId });

// Horario de una categoría (ej. café da manhã de 07:00 a 11:00). null = siempre.
const categorySchedule = z
  .object({
    days: z.array(z.enum(WEEKDAYS)).max(7).refine(unique, "Dia repetido").default([]),
    from: time,
    to: closingTime,
  })
  .refine((schedule) => schedule.from !== schedule.to, "O início e o fim não podem ser iguais")
  .nullable();

const categoryFields = {
  name: requiredText(60),
  active: z.boolean(),
  position,
  schedule: categorySchedule,
  translations: translation({ name: 60 }),
};

export const createCategorySchema = z
  .object(categoryFields)
  .partial({ active: true, position: true, schedule: true, translations: true });

export const updateCategorySchema = z.object(categoryFields).partial().refine(notEmpty, "Nada para atualizar");

const productFields = {
  category: objectId,
  name: requiredText(80),
  description: optionalText(300),
  priceCents: cents,
  // Promoción: el precio promocional y, opcionalmente, desde y hasta cuándo vale.
  promoPriceCents: cents.nullable(),
  promoStartsAt: dateTime.nullable(),
  promoEndsAt: dateTime.nullable(),
  imageUrl,
  tags: z.array(z.enum(PRODUCT_TAGS)).max(PRODUCT_TAGS.length).refine(unique, "Etiqueta repetida"),
  featured: z.boolean(),
  available: z.boolean(),
  trackStock: z.boolean(),
  stock: z.number().int().min(0).max(100_000),
  position,
  optionGroups: z.array(objectId).max(20).refine(unique, "Grupo repetido"),
  translations: translation({ name: 80, description: 300 }),
};

const productOptional = Object.fromEntries(
  Object.keys(productFields)
    .filter((key) => !["category", "name", "priceCents"].includes(key))
    .map((key) => [key, true])
);

export const createProductSchema = z.object(productFields).partial(productOptional);

export const updateProductSchema = z.object(productFields).partial().refine(notEmpty, "Nada para atualizar");

export const listProductsQuery = z.object({ category: objectId.optional() });

const optionSchema = z.object({
  // Mandar el _id de una opción existente la conserva (y sus pedidos siguen apuntando a ella).
  _id: objectId.optional(),
  name: requiredText(60),
  priceCents: cents.default(0),
  // Cuántas veces se puede elegir la misma opción ("2x bacon").
  maxQuantity: z.number().int().min(1).max(10).default(1),
  available: z.boolean().default(true),
  translations: translation({ name: 60 }).default({}),
});

const optionGroupFields = {
  name: requiredText(60),
  minSelect: z.number().int().min(0).max(50),
  maxSelect: z.number().int().min(1).max(50),
  // sum: cada opción suma; max: vale la más cara (pizza meio a meio); average: el promedio.
  pricing: z.enum(PRICING_RULES),
  options: z.array(optionSchema).min(1).max(50),
  translations: translation({ name: 60 }),
};

export const createOptionGroupSchema = z
  .object(optionGroupFields)
  .partial({ minSelect: true, maxSelect: true, pricing: true, translations: true });

export const updateOptionGroupSchema = z
  .object(optionGroupFields)
  .partial()
  .refine(notEmpty, "Nada para atualizar");

export const optionParams = z.object({ id: objectId, optionId: objectId });

// Marcar disponible o agotado (producto u opción).
export const availabilitySchema = z.object({ available: z.boolean() });

// Import de la planilla del menú: el CSV va como texto dentro del JSON.
export const importMenuSchema = z.object({
  csv: z.string().min(1, "A planilha está vazia").max(95_000, "Planilha grande demais"),
  // Por defecto solo muestra qué haría; con false, aplica.
  dryRun: z.boolean().default(true),
});

// Para qué es la imagen: define la carpeta del local en Cloudinary.
export const IMAGE_KINDS = ["logo", "cover", "product"];
export const uploadSignatureSchema = z.object({ kind: z.enum(IMAGE_KINDS) });
