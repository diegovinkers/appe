import { Router } from "express";
import { receiveWebhook, verifyWebhook } from "../controllers/whatsapp.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { webhookBody, webhookVerifyQuery } from "../schemas/whatsapp.schema.js";

// Webhook de WhatsApp (Meta). Sin sesión: lo que prueba que viene de Meta es el verify
// token al configurarlo y, en cada mensaje, la firma con el App Secret.
const router = Router();

router.get("/webhook", validate({ query: webhookVerifyQuery }), verifyWebhook);
router.post("/webhook", validate({ body: webhookBody }), receiveWebhook);

export default router;
