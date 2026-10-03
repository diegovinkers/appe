import { z } from "zod";
import { PAYMENT_METHODS } from "../models/commerce.model.js";
import { ORDER_CHANNELS, ORDER_LOCALES } from "../models/order.model.js";
import { isValidDay } from "../lib/dates.js";
import { ORDER_STATUSES } from "../services/orderStatus.js";
import { cents, dateTime, objectId, optionalText, phone } from "./common.schema.js";

// Textos del cliente en una sola línea: van tal cual al mensaje de WhatsApp.
const line = (max) => z.string().trim().max(max).transform((value) => value.replace(/\s+/g, " "));
const requiredLine = (max) => line(max).pipe(z.string().min(1, "Campo obrigatório"));

export const couponCode = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.string().regex(/^[A-Z0-9_-]{3,20}$/, "Cupom inválido"));

const itemSchema = z.object({
  productId: objectId,
  quantity: z.number().int().min(1).max(50),
  // quantity: cuántas veces la misma opción ("2x bacon"), hasta su maxQuantity.
  options: z
    .array(z.object({ groupId: objectId, optionId: objectId, quantity: z.number().int().min(1).max(10).default(1) }))
    .max(30)
    .default([]),
  notes: line(140).optional(),
});

// Si el local entrega por barrio, el cliente elige uno de la lista (zoneId) y el
// nombre sale del barrio; si no, escribe el suyo (neighborhood).
const addressSchema = z.object({
  street: requiredLine(120),
  number: requiredLine(20),
  neighborhood: requiredLine(80).optional(),
  zoneId: objectId.optional(),
  reference: line(120).optional(),
});

const orderFields = {
  // Lo genera el front (ej. crypto.randomUUID()) para no duplicar pedidos si se reenvía.
  clientOrderId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/, "clientOrderId inválido"),
  customer: z.object({ name: requiredLine(60), phone }),
  fulfillment: z.enum(["delivery", "pickup"]),
  address: addressSchema.optional(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  changeForCents: cents.optional(),
  notes: line(300).optional(),
  items: z.array(itemSchema).min(1, "O carrinho está vazio").max(50),
  couponCode: couponCode.optional(),
  // Pedido programado: el inicio de una de las franjas de /slots. Sin esto, lo antes posible.
  scheduledFor: dateTime.optional(),
  // Idioma del mensaje de WhatsApp.
  locale: z.enum(ORDER_LOCALES).default("pt-BR"),
};

const withAddressRule = (schema) =>
  schema
    .superRefine((order, ctx) => {
      if (order.fulfillment === "delivery" && !order.address) {
        ctx.addIssue({ code: "custom", path: ["address"], message: "Informe o endereço de entrega" });
      }
    })
    .transform(({ address, ...order }) => (order.fulfillment === "delivery" ? { ...order, address } : order));

// Pedido del cliente final. Los precios no se aceptan: los pone el servidor.
export const createOrderSchema = withAddressRule(z.object({ ...orderFields, acquisitionSource: z.enum(["direct", "directory"]).default("direct") }));

// Pedido cargado en el panel (llegó por teléfono, WhatsApp o en el mostrador). En el
// mostrador el teléfono puede faltar; clientOrderId es opcional (lo genera el servidor).
export const manualOrderSchema = withAddressRule(
  z
    .object({
      ...orderFields,
      clientOrderId: orderFields.clientOrderId.optional(),
      customer: z.object({ name: requiredLine(60), phone: phone.optional() }),
      channel: z.enum(ORDER_CHANNELS.filter((channel) => channel !== "online")),
    })
    .superRefine((order, ctx) => {
      if (order.channel !== "counter" && !order.customer.phone) {
        ctx.addIssue({ code: "custom", path: ["customer", "phone"], message: "Informe o telefone" });
      }
    })
);

export const listOrdersQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidDay, "Data inválida").optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  // Para el polling del panel: solo lo que cambió desde el serverTime de la respuesta anterior.
  updatedSince: z.iso.datetime({ offset: true }).optional(),
});

export const updateOrderStatusSchema = z
  .object({
    status: z.enum(ORDER_STATUSES),
    // Obligatorio al cancelar.
    reason: optionalText(200).optional(),
    // Al confirmar, el local puede ajustar el tiempo estimado (en minutos).
    estimatedMinutes: z
      .object({ min: z.number().int().min(0).max(600), max: z.number().int().min(0).max(600) })
      .refine((estimate) => estimate.min <= estimate.max, "O mínimo não pode ser maior que o máximo")
      .optional(),
  })
  .superRefine((change, ctx) => {
    if (change.status === "cancelled" && !change.reason) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Informe o motivo do cancelamento" });
    }
    if (change.estimatedMinutes && change.status !== "confirmed") {
      ctx.addIssue({ code: "custom", path: ["estimatedMinutes"], message: "O tempo se ajusta ao confirmar" });
    }
  });

export const orderNotesSchema = z.object({ internalNotes: optionalText(500) });

export const ticketQuery = z.object({
  format: z.enum(["html", "text"]).default("html"),
  width: z.coerce.number().pipe(z.literal([58, 80])).default(80),
});

export const trackingParams = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/, "Link inválido") });

export const validateCouponSchema = z.object({ code: couponCode, phone: phone.optional() });
