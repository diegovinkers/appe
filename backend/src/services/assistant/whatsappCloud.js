// Cliente de la API oficial de WhatsApp (Cloud API de Meta): firma del webhook, enviar
// mensajes y bajar audios. Los tests ponen un cliente falso con setWhatsappClient(): nunca
// llaman a Meta.
import { createHmac, timingSafeEqual } from "node:crypto";
import { config, isTest } from "../../config.js";

// WhatsApp corta los mensajes de texto en 4096 caracteres.
const MAX_TEXT = 4000;

export const whatsappConfigured = () =>
  Boolean(config.WHATSAPP_ACCESS_TOKEN && config.WHATSAPP_APP_SECRET && config.WHATSAPP_VERIFY_TOKEN);

// El webhook viene firmado por Meta con el App Secret: X-Hub-Signature-256: sha256=<hex>.
export function validSignature(rawBody, header) {
  if (!config.WHATSAPP_APP_SECRET || !rawBody || typeof header !== "string" || !header.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", config.WHATSAPP_APP_SECRET).update(rawBody).digest();
  const given = Buffer.from(header.slice("sha256=".length), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Un texto largo en varios mensajes, cortando en saltos de línea.
export function splitText(text) {
  const parts = [];
  let rest = text.trim();
  while (rest.length > MAX_TEXT) {
    const cut = rest.lastIndexOf("\n", MAX_TEXT);
    const at = cut > MAX_TEXT / 2 ? cut : MAX_TEXT;
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

let override;

export function getWhatsappClient() {
  if (override) return override;
  // En los tests, nunca la API real.
  if (isTest) throw new Error("En los tests hay que usar setWhatsappClient()");
  return metaClient;
}

export function setWhatsappClient(client) {
  override = client;
}
