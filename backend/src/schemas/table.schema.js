import { z } from "zod";
import { PAYMENT_METHODS } from "../models/commerce.model.js";
import { GRID_COLUMNS, GRID_ROWS } from "../models/table.model.js";
import { cents, objectId, optionalText } from "./common.schema.js";
import { tableItemsSchema } from "./order.schema.js";

const number = z.number().int().min(1, "Use um número de 1 a 999").max(999, "Use um número de 1 a 999");
const x = z.number().int().min(0).max(GRID_COLUMNS - 1);
const y = z.number().int().min(0).max(GRID_ROWS - 1);

// Mesa nueva: el número y el lugar, si faltan, los pone el servidor (el siguiente y el primer lugar libre).
export const createTableSchema = z.object({
  number: number.optional(),
  name: optionalText(30).default(""),
  seats: z.number().int().min(1).max(30).default(4),
  x: x.optional(),
  y: y.optional(),
});

export const updateTableSchema = z
  .object({ number, name: optionalText(30), seats: z.number().int().min(1).max(30), active: z.boolean(), x, y })
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, "Nada para atualizar");

// Acomodar el salón de una vez (al arrastrar mesas).
export const tableLayoutSchema = z.object({
  positions: z.array(z.object({ id: objectId, x, y })).min(1).max(200),
});

// Pedido en la cuenta de una mesa: los productos y una observación; el resto lo pone el servidor.
export const tableOrderSchema = z.object({
  clientOrderId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/, "clientOrderId inválido").optional(),
  items: tableItemsSchema,
  notes: optionalText(300).optional(),
});

export const moveTabSchema = z.object({ tableId: objectId });
export const serviceFeeSchema = z.object({ waived: z.boolean() });

// Cerrar la cuenta cobrando. Sin pedidos (la mesa se fue sin consumir) no hace falta forma de pago.
// Dividida: `payments`, una parte por persona (cada una con su forma de pago); tienen que sumar
// justo el total.
const paymentPart = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS),
  amountCents: cents.refine((value) => value > 0, "O valor precisa ser maior que zero"),
  changeForCents: cents.optional(),
});
export const closeTabSchema = z
  .object({
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    changeForCents: cents.optional(),
    payments: z.array(paymentPart).min(1).max(20).optional(),
  })
  .refine((body) => !(body.payments && body.paymentMethod), "Use paymentMethod ou payments, não os dois");
