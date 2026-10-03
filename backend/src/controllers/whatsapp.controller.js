import { timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { AppError, forbidden, notFound } from "../lib/errors.js";
import { processWebhook } from "../services/assistant/whatsapp.js";
import { validSignature, whatsappConfigured } from "../services/assistant/whatsappCloud.js";

const sameText = (a, b) => {
  const [left, right] = [Buffer.from(String(a)), Buffer.from(String(b))];
  return left.length === right.length && timingSafeEqual(left, right);
};

// GET /api/whatsapp/webhook — Meta lo llama una vez al configurar el webhook: si el token
// es el nuestro, se le devuelve el challenge.
export const verifyWebhook = (req, res) => {
  if (!whatsappConfigured()) throw notFound();
  const query = req.valid.query;
  if (query["hub.mode"] !== "subscribe" || !sameText(query["hub.verify_token"], config.WHATSAPP_VERIFY_TOKEN)) {
    throw forbidden("INVALID_VERIFY_TOKEN", "Token de verificação inválido");
  }
  res.type("text/plain").send(query["hub.challenge"]);
};

// POST /api/whatsapp/webhook — mensajes de los clientes. Se contesta 200 enseguida (si no,
// Meta reenvía) y se procesan después.
export const receiveWebhook = (req, res) => {
  if (!whatsappConfigured()) throw notFound();
  if (!validSignature(req.rawBody, req.get("x-hub-signature-256"))) {
    throw new AppError(401, "INVALID_SIGNATURE", "Assinatura inválida");
  }
  processWebhook(req.valid.body);
  res.json({ ok: true });
};
