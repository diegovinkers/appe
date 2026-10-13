import express, { Router } from "express";
import { receive360dialogWebhook, receiveTwilioWebhook, receiveWebhook, verifyWebhook } from "../controllers/whatsapp.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { d360WebhookBody, d360WebhookParams, twilioWebhookBody, webhookBody, webhookVerifyQuery } from "../schemas/whatsapp.schema.js";

// Webhooks de WhatsApp (Meta, Twilio o 360dialog). Sin sesión: lo que prueba que viene de ellos
// es la firma de cada mensaje (App Secret de Meta, Auth Token de Twilio) o, en 360dialog, el
// secreto de la URL.
const router = Router();

router.get("/webhook", validate({ query: webhookVerifyQuery }), verifyWebhook);
router.post("/webhook", validate({ body: webhookBody }), receiveWebhook);
// Twilio manda formularios, no JSON (por eso está en la excepción de requireJsonContentType).
router.post("/twilio", express.urlencoded({ extended: false, limit: "100kb" }), validate({ body: twilioWebhookBody }), receiveTwilioWebhook);
router.post("/360dialog/:token", validate({ params: d360WebhookParams, body: d360WebhookBody }), receive360dialogWebhook);

export default router;
