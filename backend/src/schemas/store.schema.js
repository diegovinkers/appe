import { z } from "zod";
import { DELIVERY_MODES, PAYMENT_METHODS, SLOT_MINUTES } from "../models/commerce.model.js";
import { isValidDay } from "../lib/dates.js";
import { WEEKDAYS } from "../services/opening.service.js";
import {
  cents,
  closingTime,
  dateTime,
  hexColor,
  imageUrl,
  objectId,
  optionalText,
  phone,
  requiredText,
  time,
  translation,
} from "./common.schema.js";

const notEmpty = (changes) => Object.keys(changes).length > 0;
const unique = (list) => new Set(list).size === list.length;
const minutes = z.number().int().min(0).max(600);

// "@Burger.Demo" → "burger.demo"; "" borra.
const instagram = z
  .string()
  .trim()
  .transform((value) => value.replace(/^@/, "").toLowerCase())
  .pipe(z.union([z.literal(""), z.string().regex(/^[a-z0-9._]{1,30}$/, "Usuário do Instagram inválido")]));

const zoneSchema = z
  .object({
    // Mandar el _id de un barrio existente lo conserva (los pedidos viejos apuntan a él).
    _id: objectId.optional(),
    name: requiredText(60),
    feeCents: cents,
    minOrderCents: cents.nullable().default(null),
    estimateMin: minutes.nullable().default(null),
    estimateMax: minutes.nullable().default(null),
    active: z.boolean().default(true),
  })
  .refine(
    (zone) => zone.estimateMin == null || zone.estimateMax == null || zone.estimateMin <= zone.estimateMax,
    "O tempo mínimo não pode ser maior que o máximo"
  );

// Datos del local que puede cambiar el dueño. El slug y el estado los maneja el
// superadmin; los horarios y la apertura manual tienen sus propios endpoints.
export const updateStoreSchema = z
  .object({
    name: requiredText(80),
    description: optionalText(300),
    about: optionalText(500),
    notice: optionalText(140),
    logoUrl: imageUrl,
    coverUrl: imageUrl,
    instagram,
    primaryColor: hexColor,
    secondaryColor: hexColor,
    whatsapp: phone,
    address: optionalText(200),
    fulfillment: z.object({ delivery: z.boolean(), pickup: z.boolean() }).partial(),
    estimates: z.object({ deliveryMin: minutes, deliveryMax: minutes, pickupMin: minutes, pickupMax: minutes }).partial(),
    deliveryMode: z.enum(DELIVERY_MODES),
    deliveryFeeCents: cents,
    deliveryZones: z.array(zoneSchema).max(100),
    freeDeliveryFromCents: cents.nullable(),
    minOrderCents: cents,
    paymentMethods: z.array(z.enum(PAYMENT_METHODS)).min(1).refine(unique, "Forma de pagamento repetida"),
    pixKey: optionalText(140),
    scheduling: z
      .object({
        enabled: z.boolean(),
        minLeadMinutes: z.number().int().min(0).max(1440),
        maxDaysAhead: z.number().int().min(0).max(14),
        slotMinutes: z.literal(SLOT_MINUTES),
      })
      .partial(),
    translations: translation({ description: 300, about: 500, notice: 140 }),
  })
  .partial()
  .refine(notEmpty, "Nada para atualizar");

// Horarios
const toMinutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));

// Minutos desde la medianoche; un cierre antes de la apertura termina al día siguiente.
function span({ open, close }) {
  const start = toMinutes(open);
  let end = close === "24:00" ? 1440 : toMinutes(close);
  if (end <= start) end += 1440;
  return [start, end];
}

const noOverlap = (intervals) => {
  const spans = intervals.map(span).sort((a, b) => a[0] - b[0]);
  return spans.every((current, index) => index === 0 || current[0] >= spans[index - 1][1]);
};

const intervalSchema = z
  .object({ open: time, close: closingTime })
  .refine((interval) => interval.open !== interval.close, "A abertura e o fechamento não podem ser iguais");

const dayIntervals = z.array(intervalSchema).max(4).refine(noOverlap, "Os turnos se sobrepõem");

const exceptionSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidDay, "Data inválida"),
    closed: z.boolean().default(false),
    intervals: dayIntervals.default([]),
    note: optionalText(60).default(""),
  })
  .refine((exception) => exception.closed || exception.intervals.length > 0, {
    error: "Informe os horários ou marque o dia como fechado",
    path: ["intervals"],
  });

export const hoursSchema = z.object({
  weekly: z.object(Object.fromEntries(WEEKDAYS.map((day) => [day, dayIntervals.default([])]))),
  exceptions: z
    .array(exceptionSchema)
    .max(60)
    .default([])
    .refine((list) => unique(list.map((exception) => exception.date)), "Data repetida"),
});

// Apertura manual. "auto" vuelve al horario.
const until = dateTime;

export const storeStatusSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("auto") }),
  z.object({ mode: z.literal("open"), until: until.optional() }),
  z.object({ mode: z.literal("closed"), until: until.optional() }),
  z.object({
    mode: z.literal("paused"),
    minutes: z.number().int().min(5).max(240),
    message: optionalText(140).default(""),
  }),
]);

export const qrQuery = z.object({
  format: z.enum(["png", "svg"]).default("png"),
  size: z.coerce.number().int().min(128).max(2048).default(512),
});
