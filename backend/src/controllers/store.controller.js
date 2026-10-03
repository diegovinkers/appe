import QRCode from "qrcode";
import { audit, diffFields } from "../lib/audit.js";
import { checkImageUrl } from "../lib/cloudinary.js";
import { todayIn } from "../lib/dates.js";
import { badRequest } from "../lib/errors.js";
import { storeUrl } from "../lib/links.js";
import { getOpeningStatus } from "../services/opening.service.js";

const AUDITED_FIELDS = [
  "name",
  "description",
  "about",
  "notice",
  "logoUrl",
  "coverUrl",
  "instagram",
  "primaryColor",
  "secondaryColor",
  "whatsapp",
  "address",
  "fulfillment",
  "estimates",
  "deliveryMode",
  "deliveryFeeCents",
  "deliveryZones",
  "freeDeliveryFromCents",
  "minOrderCents",
  "paymentMethods",
  "pixKey",
  "scheduling",
  "translations",
];

const MAX_OVERRIDE_DAYS = 7;

// Lo que ve el panel: el local, su estado de apertura calculado y el link del menú.
const storeView = (store) => ({ store, opening: getOpeningStatus(store), storeUrl: storeUrl(store) });

// Los barrios que llegan con _id tienen que existir; los nombres no se repiten.
function checkZones(store, zones) {
  const current = new Set(store.deliveryZones.map((zone) => String(zone._id)));
  const kept = zones.filter((zone) => zone._id).map((zone) => zone._id);
  if (kept.some((id) => !current.has(id)) || new Set(kept).size !== kept.length) {
    throw badRequest("INVALID_ZONE", "Bairro inválido");
  }
  const names = zones.map((zone) => zone.name.toLocaleLowerCase("pt-BR"));
  if (new Set(names).size !== names.length) throw badRequest("DUPLICATE_ZONE", "Há bairros com o mesmo nome");
}

// Reglas que dependen de varios campos: se chequean con el local ya actualizado.
function checkConsistency(store) {
  if (!store.fulfillment.delivery && !store.fulfillment.pickup) {
    throw badRequest("NO_FULFILLMENT", "Ative a entrega, a retirada ou as duas");
  }
  if (store.paymentMethods.includes("pix") && !store.pixKey) {
    throw badRequest("PIX_KEY_REQUIRED", "Informe a chave Pix para aceitar Pix");
  }
  const { deliveryMin, deliveryMax, pickupMin, pickupMax } = store.estimates;
  if (deliveryMin > deliveryMax || pickupMin > pickupMax) {
    throw badRequest("INVALID_ESTIMATES", "O tempo mínimo não pode ser maior que o máximo");
  }
  if (
    store.fulfillment.delivery &&
    store.deliveryMode === "zones" &&
    !store.deliveryZones.some((zone) => zone.active)
  ) {
    throw badRequest("NO_DELIVERY_ZONES", "Cadastre pelo menos um bairro ativo para entregar por bairro");
  }
}

export const getStore = (req, res) => {
  res.json(storeView(req.commerce));
};

export const updateStore = async (req, res) => {
  const { fulfillment, estimates, scheduling, translations, ...changes } = req.valid.body;
  const store = req.commerce;
  const before = store.toObject();
  checkImageUrl(changes.logoUrl, store._id, "logoUrl");
  checkImageUrl(changes.coverUrl, store._id, "coverUrl");

  if (changes.deliveryZones) checkZones(store, changes.deliveryZones);
  store.set(changes);
  // Los objetos anidados se combinan con lo que ya había, campo por campo.
  const nested = { fulfillment, estimates, scheduling, "translations.es": translations?.es };
  for (const [group, values] of Object.entries(nested)) {
    for (const [field, value] of Object.entries(values ?? {})) store.set(`${group}.${field}`, value);
  }
  checkConsistency(store);

  await store.save();
  const changed = diffFields(before, store.toObject(), AUDITED_FIELDS);
  if (Object.keys(changed).length) {
    await audit(req, { action: "store.updated", entity: { type: "commerce", id: store._id }, changes: changed });
  }
  res.json(storeView(store));
};

// Reemplaza el horario semanal y las excepciones. Las excepciones de días que ya pasaron se descartan.
export const setHours = async (req, res) => {
  const store = req.commerce;
  const today = todayIn();
  const { weekly, exceptions } = req.valid.body;
  store.hours = { weekly, exceptions: exceptions.filter((exception) => exception.date >= today) };
  await store.save();
  await audit(req, { action: "store.hours_updated", entity: { type: "commerce", id: store._id } });
  res.json(storeView(store));
};

// Abrir, cerrar o pausar a mano, o volver al horario ("auto").
export const setStatus = async (req, res) => {
  const store = req.commerce;
  const input = req.valid.body;
  const now = new Date();

  if (input.until && (input.until <= now || input.until - now > MAX_OVERRIDE_DAYS * 24 * 60 * 60 * 1000)) {
    throw badRequest("INVALID_UNTIL", `Escolha um horário futuro, de até ${MAX_OVERRIDE_DAYS} dias`);
  }

  if (input.mode === "auto") store.override = null;
  else if (input.mode === "paused") {
    store.override = { mode: "paused", until: new Date(now.getTime() + input.minutes * 60_000), message: input.message };
  } else store.override = { mode: input.mode, until: input.until ?? null, message: "" };

  await store.save();
  await audit(req, {
    action: "store.status_changed",
    entity: { type: "commerce", id: store._id },
    changes: { mode: input.mode, until: store.override?.until ?? null },
  });
  res.json(storeView(store));
};

// QR del link del menú, para imprimir y poner en el mostrador.
export const getQrCode = async (req, res) => {
  const { format, size } = req.valid.query;
  const url = storeUrl(req.commerce);
  const filename = `qr-${req.commerce.slug}.${format}`;
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

  if (format === "svg") {
    res.type("image/svg+xml").send(await QRCode.toString(url, { type: "svg", margin: 2, width: size }));
  } else {
    res.type("image/png").send(await QRCode.toBuffer(url, { type: "png", margin: 2, width: size }));
  }
};
