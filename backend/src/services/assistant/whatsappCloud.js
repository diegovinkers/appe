// Clientes de WhatsApp: la Cloud API de Meta, Twilio o 360dialog (WHATSAPP_PROVIDER). Firma del
// webhook, enviar mensajes y bajar audios. Los tests ponen un cliente falso con setWhatsappClient():
// nunca llaman a Meta, Twilio ni 360dialog.
import { createHmac, timingSafeEqual } from "node:crypto";
import twilio from "twilio";
import { config, isTest } from "../../config.js";

// WhatsApp corta los mensajes de texto en 4096 caracteres; Twilio, en 1600.
const MAX_TEXT = 4000;
const TWILIO_MAX_TEXT = 1600;

// Cada webhook atiende solo si su proveedor es el elegido y tiene sus claves.
export const metaConfigured = () =>
  config.WHATSAPP_PROVIDER === "meta" &&
  Boolean(config.WHATSAPP_ACCESS_TOKEN && config.WHATSAPP_APP_SECRET && config.WHATSAPP_VERIFY_TOKEN);
export const twilioConfigured = () =>
  config.WHATSAPP_PROVIDER === "twilio" && Boolean(config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN && config.TWILIO_WEBHOOK_URL);
export const d360Configured = () =>
  config.WHATSAPP_PROVIDER === "360dialog" && Boolean(config.D360_API_KEY && config.D360_WEBHOOK_TOKEN);
export const whatsappConfigured = () => metaConfigured() || twilioConfigured() || d360Configured();

// El webhook viene firmado por Meta con el App Secret: X-Hub-Signature-256: sha256=<hex>.
export function validSignature(rawBody, header) {
  if (!config.WHATSAPP_APP_SECRET || !rawBody || typeof header !== "string" || !header.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", config.WHATSAPP_APP_SECRET).update(rawBody).digest();
  const given = Buffer.from(header.slice("sha256=".length), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Twilio firma con el Auth Token: X-Twilio-Signature, sobre su URL del webhook y los parámetros
// del formulario. Con su librería, porque Twilio agrega parámetros sin avisar.
export function validTwilioSignature(header, params) {
  if (!config.TWILIO_AUTH_TOKEN || !config.TWILIO_WEBHOOK_URL || typeof header !== "string" || !params) return false;
  return twilio.validateRequest(config.TWILIO_AUTH_TOKEN, header, config.TWILIO_WEBHOOK_URL, params);
}

// Un texto largo en varios mensajes, cortando en saltos de línea.
export function splitText(text, max = MAX_TEXT) {
  const parts = [];
  let rest = text.trim();
  while (rest.length > max) {
    const cut = rest.lastIndexOf("\n", max);
    const at = cut > max / 2 ? cut : max;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

class WhatsappError extends Error {
  constructor(status, code) {
    super(`WhatsApp respondió ${status}`);
    this.name = "WhatsappError";
    this.status = status;
    this.code = code;
  }
}

async function graph(path, { method = "GET", body } = {}) {
  const response = await fetch(`https://graph.facebook.com/${config.WHATSAPP_GRAPH_VERSION}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`, ...(body && { "Content-Type": "application/json" }) },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json().catch(() => null);
  // Sin el cuerpo del error en el mensaje: puede traer el teléfono del cliente.
  if (!response.ok) throw new WhatsappError(response.status, data?.error?.code);
  return data;
}

const metaClient = {
  async sendText({ phoneNumberId, to, text }) {
    const ids = [];
    for (const body of splitText(text)) {
      const data = await graph(`${phoneNumberId}/messages`, {
        method: "POST",
        body: { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body, preview_url: true } },
      });
      ids.push(data?.messages?.[0]?.id ?? null);
    }
    return ids;
  },
  // Los dos tildes azules: el cliente ve que el mensaje se leyó.
  async markRead({ phoneNumberId, messageId }) {
    await graph(`${phoneNumberId}/messages`, { method: "POST", body: { messaging_product: "whatsapp", status: "read", message_id: messageId } });
  },
  // Nota de voz: se sube el archivo (OGG/Opus) y se manda el audio con el id que devuelve Meta.
  async sendAudio({ phoneNumberId, to, audio }) {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", "audio/ogg");
    form.append("file", new Blob([audio], { type: "audio/ogg" }), "resposta.ogg");
    const response = await fetch(`https://graph.facebook.com/${config.WHATSAPP_GRAPH_VERSION}/${phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    const media = await response.json().catch(() => null);
    if (!response.ok || !media?.id) throw new WhatsappError(response.status, media?.error?.code);
    await graph(`${phoneNumberId}/messages`, {
      method: "POST",
      body: { messaging_product: "whatsapp", recipient_type: "individual", to, type: "audio", audio: { id: media.id } },
    });
  },
  // Un audio: primero la URL (dura unos minutos) y después el archivo, los dos con el token.
  async downloadMedia(mediaId) {
    const { url, mime_type: mimeType } = await graph(mediaId);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new WhatsappError(response.status);
    return { buffer: Buffer.from(await response.arrayBuffer()), mimeType };
  },
};

let twilioApi;

// Con Twilio, el número del local va en el panel sin "+" (como el wa_id): 14155238886 es el Sandbox.
const twilioClient = {
  async sendText({ phoneNumberId, to, text }) {
    twilioApi ??= twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
    const ids = [];
    for (const body of splitText(text, TWILIO_MAX_TEXT)) {
      // Si falla, el error trae status y code de Twilio (63015: el cliente no se unió al Sandbox).
      const message = await twilioApi.messages.create({ from: `whatsapp:+${phoneNumberId}`, to: `whatsapp:+${to}`, body });
      ids.push(message.sid);
    }
    return ids;
  },
  // Twilio no marca los mensajes como leídos.
  async markRead() {},
  // Twilio no recibe el archivo: lo baja de una URL pública. Por ahora, solo texto.
  async sendAudio() {
    throw new WhatsappError(501, "TWILIO_AUDIO_NOT_SUPPORTED");
  },
  // El audio de un cliente: la URL de Twilio que llegó en el webhook, con las claves de la cuenta.
  async downloadMedia(url) {
    if (typeof url !== "string" || !url.startsWith("https://api.twilio.com/")) throw new WhatsappError(400, "INVALID_MEDIA_URL");
    const auth = Buffer.from(`${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`).toString("base64");
    const response = await fetch(url, { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new WhatsappError(response.status);
    return { buffer: Buffer.from(await response.arrayBuffer()), mimeType: response.headers.get("content-type") };
  },
};

// 360dialog: la misma API de Meta detrás de su dominio, con la API key del número.
async function d360(path, body) {
  const response = await fetch(`${config.D360_API_URL}/${path}`, {
    method: "POST",
    headers: { "D360-API-KEY": config.D360_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json().catch(() => null);
  // Sin el cuerpo del error en el mensaje: puede traer el teléfono del cliente.
  if (!response.ok) throw new WhatsappError(response.status, data?.error?.code);
  return data;
}

// Por ahora solo texto: el sandbox no maneja archivos ni el aviso de leído (y cada llamada
// cuenta en su tope de 200 mensajes).
const d360Client = {
  async sendText({ to, text }) {
    const ids = [];
    for (const body of splitText(text)) {
      const data = await d360("messages", { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body } });
      ids.push(data?.messages?.[0]?.id ?? null);
    }
    return ids;
  },
  async markRead() {},
  async sendAudio() {
    throw new WhatsappError(501, "D360_AUDIO_NOT_SUPPORTED");
  },
  async downloadMedia() {
    throw new WhatsappError(501, "D360_MEDIA_NOT_SUPPORTED");
  },
};

const CLIENTS = { meta: metaClient, twilio: twilioClient, "360dialog": d360Client };

let override;

export function getWhatsappClient() {
  if (override) return override;
  // En los tests, nunca la API real.
  if (isTest) throw new Error("En los tests hay que usar setWhatsappClient()");
  return CLIENTS[config.WHATSAPP_PROVIDER];
}

export function setWhatsappClient(client) {
  override = client;
}
