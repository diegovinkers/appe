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

// Cada POST de Twilio (formulario: todo llega como texto). Solo lo que se usa; Twilio manda
// más campos, y la firma prueba que lo mandó Twilio.
export const twilioWebhookBody = z.looseObject({
  MessageSid: z.string().max(64),
  From: z.string().max(64),
  To: z.string().max(64),
  Body: z.string().max(10_000).optional(),
  ProfileName: z.string().max(200).optional(),
  NumMedia: z.string().regex(/^\d{1,2}$/).optional(),
  MediaUrl0: z.string().max(500).optional(),
  MediaContentType0: z.string().max(100).optional(),
  Latitude: z.string().max(40).optional(),
});
