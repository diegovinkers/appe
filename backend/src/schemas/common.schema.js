import { z } from "zod";
import { normalizePhone } from "../lib/phone.js";
import { HEX_COLOR, RESERVED_SLUGS, SLUG_PATTERN } from "../models/commerce.model.js";

// Mensajes de validación en portugués: los ve el usuario final.
z.config(z.locales.pt());

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, "ID inválido");

export const idParams = z.object({ id: objectId });

export const requiredText = (max) => z.string().trim().min(1, "Campo obrigatório").max(max);

export const optionalText = (max) => z.string().trim().max(max);

// Plata siempre en centavos enteros. Tope: R$ 100.000,00.
export const cents = z.number().int("Use centavos (número inteiro)").min(0).max(10_000_000);

export const hexColor = z.string().regex(HEX_COLOR, "Cor inválida (use #RRGGBB)");

// "" borra la imagen.
export const imageUrl = z.union([z.literal(""), z.url({ protocol: /^https?$/ }).max(500)]);

export const phone = z
  .string()
  .trim()
  .max(30)
  .transform((value, ctx) => {
    const e164 = normalizePhone(value);
    if (!e164) {
      ctx.addIssue({ code: "custom", message: "Telefone inválido. Inclua o DDD." });
      return z.NEVER;
    }
    return e164;
  });

export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(40)
  .regex(SLUG_PATTERN, "Use só letras minúsculas, números e hífens")
  .refine((value) => !RESERVED_SLUGS.includes(value), "Esse endereço é reservado");

export const email = z.string().trim().toLowerCase().pipe(z.email("E-mail inválido").max(254));

// Hora local "HH:MM". Un cierre puede ser "24:00" (medianoche).
export const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato HH:MM");
export const closingTime = z.union([time, z.literal("24:00")]);

// Fecha y hora ISO que se convierte a Date.
export const dateTime = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

// Textos en español opcionales ("" = se muestra el portugués).
export const translation = (fields) => {
  const texts = Object.fromEntries(Object.entries(fields).map(([key, max]) => [key, optionalText(max)]));
  return z.object({ es: z.object(texts).partial() }).partial();
};

// bcrypt solo usa los primeros 72 bytes.
export const newPassword = z.string().min(8, "A senha precisa ter pelo menos 8 caracteres").max(72);
