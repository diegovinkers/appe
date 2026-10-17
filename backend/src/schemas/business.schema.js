import { z } from "zod";
import { cents, dateTime, optionalText, requiredText } from "./common.schema.js";
import { isValidDay } from "../lib/dates.js";
import { PAYMENT_METHODS } from "../models/commerce.model.js";
import { SUBSCRIPTION_PLANS } from "../models/subscription.model.js";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidDay, "Data inválida");
export const subscriptionInput = z.object({
  plan: z.enum(SUBSCRIPTION_PLANS), priceCents: cents, dueDate: day.nullable(), status: z.enum(["trial", "active", "cancelled"]),
});
export const subscriptionPaymentInput = z.object({
  reference: z.uuid(), amountCents: cents.refine((value) => value > 0), paidAt: dateTime,
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), note: optionalText(200).default(""),
});
export const reportsQuery = z.object({ from: day, to: day })
  .refine(({ from, to }) => from <= to && (Date.parse(to) - Date.parse(from)) / 86400000 <= 366, "Escolha um período de até 367 dias, com início antes do fim");

export const subscriptionResponse = z.strictObject({ subscription: z.strictObject({
  plan: z.string(), priceCents: z.number().int().nonnegative(), dueDate: day.nullable(), status: z.enum(["trial", "active", "cancelled"]), overdue: z.boolean(),
  payments: z.array(z.strictObject({ reference: z.string(), amountCents: z.number().int().positive(), paidAt: z.iso.datetime(), period: z.string(), note: z.string() })),
}) });
export const reportResponse = z.strictObject({
  from: day, to: day, timeZone: z.string(), completed: z.number().int().nonnegative(), cancelled: z.number().int().nonnegative(),
  salesCents: z.number().int().nonnegative(), averageCents: z.number().int().nonnegative(),
  // Cierre de caja: lo vendido separado en productos, envíos y descuentos, y lo que sigue abierto.
  subtotalCents: z.number().int().nonnegative(), deliveryFeeCents: z.number().int().nonnegative(), discountCents: z.number().int().nonnegative(),
  // La tasa de servicio de las mesas cerradas en el período (ya sumada en salesCents).
  serviceFeeCents: z.number().int().nonnegative(),
  open: z.strictObject({ count: z.number().int().nonnegative(), salesCents: z.number().int().nonnegative() }),
  payments: z.array(z.strictObject({ method: z.enum(PAYMENT_METHODS), count: z.number().int().nonnegative(), salesCents: z.number().int().nonnegative() })),
  fulfillment: z.array(z.strictObject({ type: z.enum(["delivery", "pickup", "table"]), count: z.number().int().nonnegative(), salesCents: z.number().int().nonnegative() })),
  days: z.array(z.strictObject({ day, count: z.number().int().nonnegative(), salesCents: z.number().int().nonnegative() })),
  products: z.array(z.strictObject({ productId: z.string(), name: z.string(), quantity: z.number().int().nonnegative(), totalCents: z.number().int().nonnegative() })),
  sources: z.array(z.strictObject({ source: z.enum(["direct", "directory", "whatsapp", "phone", "counter", "table", "unknown"]), count: z.number().int().nonnegative(), salesCents: z.number().int().nonnegative() })),
});
