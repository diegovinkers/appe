import express, { Router } from "express";
import { receiveTwilioWebhook, receiveWebhook, verifyWebhook } from "../controllers/whatsapp.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { twilioWebhookBody, webhookBody, webhookVerifyQuery } from "../schemas/whatsapp.schema.js";

// Webhooks de WhatsApp (Meta o Twilio). Sin sesión: lo que prueba que viene de ellos es la
// firma de cada mensaje (App Secret de Meta, Auth Token de Twilio).
const router = Router();

router.get("/webhook", validate({ query: webhookVerifyQuery }), verifyWebhook);
router.post("/webhook", validate({ body: webhookBody }), receiveWebhook);
// Twilio manda formularios, no JSON (por eso está en la excepción de requireJsonContentType).
router.post("/twilio", express.urlencoded({ extended: false, limit: "100kb" }), validate({ body: twilioWebhookBody }), receiveTwilioWebhook);

export default router;
