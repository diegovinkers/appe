import { z } from "zod";
import { ORDER_LOCALES } from "../models/order.model.js";
import { newPassword, objectId, optionalText, phone, requiredText } from "./common.schema.js";

const trackingToken = z.string().regex(/^[A-Za-z0-9_-]{20,64}$/);

// Pedidos hechos desde este aparato (los guarda el navegador): se asocian a la cuenta
// si además son del mismo teléfono.
const orderTokens = z.array(trackingToken).max(20).default([]);

export const addressInput = z.object({
  _id: objectId.optional(),
  label: optionalText(40).default(""),
  street: requiredText(120),
  number: requiredText(20),
  neighborhood: requiredText(80),
  reference: optionalText(120).default(""),
});

// Crear la cuenta: lo mínimo. Nombre y teléfono suelen venir de la última compra.
export const signupSchema = z.object({
  name: requiredText(60),
  phone,
  password: newPassword,
  locale: z.enum(ORDER_LOCALES).default("pt-BR"),
  address: addressInput.omit({ _id: true }).optional(),
  orderTokens,
});

export const customerLoginSchema = z.object({
  phone,
  password: z.string().min(1).max(72),
  orderTokens,
});

export const updateCustomerSchema = z
  .object({
    name: requiredText(60),
    locale: z.enum(ORDER_LOCALES),
    addresses: z.array(addressInput).max(10),
  })
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, "Nada para atualizar");

export const linkOrdersSchema = z.object({ orderTokens: z.array(trackingToken).min(1).max(20) });

export const deleteCustomerSchema = z.object({ password: z.string().min(1).max(72) });
