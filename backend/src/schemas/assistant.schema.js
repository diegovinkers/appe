import { z } from "zod";
import { CONVERSATION_CHANNELS, CONVERSATION_STATUSES } from "../models/conversation.model.js";
import { ORDER_LOCALES } from "../models/order.model.js";
import { objectId, optionalText, phone, requiredText } from "./common.schema.js";

export const updateAssistantSchema = z
  .object({
    enabled: z.boolean(),
    // Id del número en Meta (solo dígitos). "" lo desconecta.
    phoneNumberId: z
      .union([z.literal(""), z.string().trim().regex(/^\d{5,30}$/, "Use o ID do número que aparece na Meta (só números)")])
      .transform((value) => value || null),
    // Centavos de dólar: 1000 = US$ 10.
    monthlyBudgetUsdCents: z.number().int().min(0).max(1_000_000),
    voiceReplies: z.boolean(),
  })
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, "Nada para atualizar");

// Un mensaje en el simulador del panel. Sin conversationId empieza una conversación nueva.
const simulatorFields = {
  conversationId: objectId.optional(),
  customer: z.object({ name: optionalText(60).default(""), phone }),
  locale: z.enum(ORDER_LOCALES).default("pt-BR"),
  // false: los pedidos se cotizan pero no se crean.
  realOrders: z.boolean().default(false),
};
export const simulatorMessageSchema = z.object({ ...simulatorFields, text: requiredText(1000) });

// Una nota de voz en base64 (OGG, WebM o MP4, como la graba el navegador). Hasta ~1,5 MB.
export const simulatorAudioSchema = z.object({
  ...simulatorFields,
  audio: z
    .string()
    .min(100, "Áudio vazio")
    .max(2_000_000, "Áudio muito longo")
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Áudio inválido"),
});

export const conversationsQuery = z.object({
  channel: z.enum(CONVERSATION_CHANNELS).optional(),
  status: z.enum(CONVERSATION_STATUSES).optional(),
});

export const staffMessageSchema = z.object({ text: requiredText(1000) });

export const speechSchema = z.object({ text: requiredText(1000), locale: z.enum(ORDER_LOCALES).default("pt-BR") });
