import { z } from "zod";

// Lo que manda Meta al configurar el webhook (GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...).
export const webhookVerifyQuery = z.object({
  "hub.mode": z.string().max(40),
  "hub.verify_token": z.string().max(200),
  "hub.challenge": z.string().max(200),
});

// Cada POST del webhook. Solo la forma general: lo que importa (mensajes) se lee con cuidado
// en src/services/assistant/whatsapp.js, y la firma prueba que lo mandó Meta.
export const webhookBody = z.looseObject({
  object: z.string().max(100),
  entry: z.array(z.looseObject({})).max(100),
});
