import mongoose from "mongoose";
import { PAYMENT_METHODS } from "./commerce.model.js";
import { COUPON_TYPES } from "./coupon.model.js";
import { ORDER_STATUSES } from "../services/orderStatus.js";

const { ObjectId } = mongoose.Schema.Types;
const cents = { type: Number, required: true, min: 0, validate: Number.isInteger };

export const ORDER_CHANNELS = ["online", "phone", "whatsapp", "counter"];
export const ORDER_LOCALES = ["pt-BR", "es"];

// Nombres y precios se copian al momento del pedido: cambiar el menú no altera pedidos viejos.
const itemOptionSchema = new mongoose.Schema(
  {
    groupId: { type: ObjectId, required: true },
    optionId: { type: ObjectId, required: true },
    group: { type: String, required: true },
    // Regla de precio del grupo al momento del pedido (sum, max, average).
    pricing: { type: String, default: "sum" },
    name: { type: String, required: true },
    // Precio de una unidad de la opción.
    priceCents: cents,
    quantity: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
);

const itemSchema = new mongoose.Schema(
  {
    product: { type: ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    // Precio del producto sin opciones (el promocional, si había promoción).
    unitPriceCents: cents,
    quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
    options: { type: [itemOptionSchema], default: [] },
    // Lo que suman las opciones por unidad, con la regla de cada grupo aplicada.
    optionsCents: { type: Number, default: 0 },
    notes: { type: String, default: "" },
    // (unitPriceCents + optionsCents) × quantity
    totalCents: cents,
    // Si se descontó stock al crear el pedido (para devolverlo si se cancela).
    stockTracked: { type: Boolean, default: false },
  },
  { _id: false }
);

const addressSchema = new mongoose.Schema(
  {
    street: { type: String, required: true },
    number: { type: String, required: true },
    neighborhood: { type: String, required: true },
    // Barrio de la lista del local (solo en entrega por barrio).
    zoneId: { type: ObjectId },
    reference: { type: String, default: "" },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    commerce: { type: ObjectId, ref: "Commerce", required: true, index: true },
    // Correlativo por local: #1, #2...
    number: { type: Number, required: true },
    // Lo genera el front; si llega repetido se devuelve el pedido ya creado.
    clientOrderId: { type: String, required: true },
    // Link de seguimiento para el cliente (/pedido/<token>): largo y no adivinable.
    trackingToken: { type: String },
    // Por dónde entró: online (el menú) o cargado a mano en el panel.
    channel: { type: String, enum: ORDER_CHANNELS, default: "online" },
    acquisitionSource: { type: String, enum: ["direct", "directory", "unknown"], default: "unknown" },
    // Cuenta del cliente que lo hizo (si pidió con la sesión iniciada o lo asoció después).
    account: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null },
    // Conversación del asistente (WhatsApp) que tomó el pedido.
    conversation: { type: ObjectId, ref: "Conversation", default: null },
    // Idioma del cliente: el mensaje de WhatsApp sale en ese idioma.
    locale: { type: String, enum: ORDER_LOCALES, default: "pt-BR" },
    customer: {
      name: { type: String, required: true },
      // Puede faltar en pedidos de mostrador.
      phone: { type: String, default: "" },
    },
    fulfillment: { type: String, enum: ["delivery", "pickup"], required: true },
    address: { type: addressSchema, default: undefined },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    // Solo en dinheiro: para cuánto hay que llevar cambio.
    changeForCents: { type: Number, default: null },
    notes: { type: String, default: "" },
    items: { type: [itemSchema], required: true },
    subtotalCents: cents,
    deliveryFeeCents: cents,
    // Descuento del cupón (sobre el subtotal, o la entrega en free_delivery).
    discountCents: { type: Number, default: 0, min: 0 },
    coupon: {
      type: new mongoose.Schema(
        { code: String, type: { type: String, enum: COUPON_TYPES }, value: Number },
        { _id: false }
      ),
      default: null,
    },
    // subtotalCents - discountCents + deliveryFeeCents
    totalCents: cents,
    // Pedido programado: para cuándo lo quiere el cliente. null = lo antes posible.
    scheduledFor: { type: Date, default: null },
    // Tiempo estimado al momento del pedido (entrega o retiro), en minutos.
    estimatedMinutes: {
      min: { type: Number },
      max: { type: Number },
    },
    status: { type: String, enum: ORDER_STATUSES, default: "new" },
    // `by`: usuario del panel que hizo el cambio (vacío si lo creó el cliente).
    statusHistory: {
      type: [
        new mongoose.Schema(
          { status: String, at: Date, by: { type: ObjectId, ref: "User" }, reason: String },
          { _id: false }
        ),
      ],
      default: [],
    },
    cancelReason: { type: String, default: "" },
    // Notas del local sobre el pedido: nunca se muestran al cliente.
    internalNotes: { type: String, default: "" },
  },
  { timestamps: true, versionKey: false }
);

orderSchema.index({ commerce: 1, clientOrderId: 1 }, { unique: true });
orderSchema.index({ trackingToken: 1 }, { unique: true, partialFilterExpression: { trackingToken: { $type: "string" } } });
orderSchema.index({ commerce: 1, scheduledFor: 1 });
orderSchema.index({ commerce: 1, number: 1 }, { unique: true });
orderSchema.index({ commerce: 1, createdAt: -1 });
// "Meus pedidos" del cliente.
orderSchema.index({ account: 1, createdAt: -1 });
orderSchema.index({ commerce: 1, updatedAt: -1 });

export default mongoose.models.Order || mongoose.model("Order", orderSchema);
