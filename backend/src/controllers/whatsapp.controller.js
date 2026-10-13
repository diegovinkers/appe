import { timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { AppError, forbidden, notFound } from "../lib/errors.js";
import { process360dialogWebhook, processTwilioWebhook, processWebhook } from "../services/assistant/whatsapp.js";
import { d360Configured, metaConfigured, twilioConfigured, validSignature, validTwilioSignature } from "../services/assistant/whatsappCloud.js";

const sameText = (a, b) => {
  const [left, right] = [Buffer.from(String(a)), Buffer.from(String(b))];
  return left.length === right.length && timingSafeEqual(left, right);
};

// GET /api/whatsapp/webhook — Meta lo llama una vez al configurar el webhook: si el token
// es el nuestro, se le devuelve el challenge.
export const verifyWebhook = (req, res) => {
  if (!metaConfigured()) throw notFound();
  const query = req.valid.query;
  if (query["hub.mode"] !== "subscribe" || !sameText(query["hub.verify_token"], config.WHATSAPP_VERIFY_TOKEN)) {
    throw forbidden("INVALID_VERIFY_TOKEN", "Token de verificação inválido");
  }
  res.type("text/plain").send(query["hub.challenge"]);
};

// POST /api/whatsapp/webhook — mensajes de los clientes. Se contesta 200 enseguida (si no,
// Meta reenvía) y se procesan después.
export const receiveWebhook = (req, res) => {
  if (!metaConfigured()) throw notFound();
  if (!validSignature(req.rawBody, req.get("x-hub-signature-256"))) {
    throw new AppError(401, "INVALID_SIGNATURE", "Assinatura inválida");
  }
  processWebhook(req.valid.body);
  res.json({ ok: true });
};

// POST /api/whatsapp/twilio — lo mismo por Twilio. La firma va sobre los parámetros tal como
// llegaron (req.body). Se contesta un TwiML vacío enseguida: Twilio espera hasta 15 s y el
// asistente tarda más; las respuestas salen después por la API de Twilio.
export const receiveTwilioWebhook = (req, res) => {
  if (!twilioConfigured()) throw notFound();
  if (!validTwilioSignature(req.get("x-twilio-signature"), req.body)) {
    throw new AppError(401, "INVALID_SIGNATURE", "Assinatura inválida");
  }
  processTwilioWebhook(req.valid.body);
  res.type("text/xml").send("<Response/>");
};

// POST /api/whatsapp/360dialog/:token — lo mismo por 360dialog. No firma los mensajes: lo que
// prueba que viene de ahí es el secreto de la URL. Con otro secreto, 404, como si no existiera.
export const receive360dialogWebhook = (req, res) => {
  if (!d360Configured() || !sameText(req.valid.params.token, config.D360_WEBHOOK_TOKEN)) throw notFound();
  process360dialogWebhook(req.valid.body);
  res.json({ ok: true });
};
