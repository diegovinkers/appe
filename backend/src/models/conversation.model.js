import mongoose from "mongoose";
import { ORDER_LOCALES } from "./order.model.js";

const { ObjectId, Mixed } = mongoose.Schema.Types;

export const CONVERSATION_CHANNELS = ["simulator", "whatsapp"];
// bot: contesta el asistente. human: la atiende alguien del local (el asistente no
// contesta). closed: terminada; si el cliente vuelve a escribir, empieza otra.
export const CONVERSATION_STATUSES = ["bot", "human", "closed"];

// Tokens y costo de la IA. El costo va en millonésimos de dólar (1_000_000 = US$ 1):
// una conversación cuesta centavos y así se suma sin decimales.
export const usageFields = {
  inputTokens: { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
  cacheWriteTokens: { type: Number, default: 0 },
  cacheReadTokens: { type: Number, default: 0 },
  costMicros: { type: Number, default: 0 },
};

// El último pedido cotizado. `criar_pedido` crea exactamente este, no lo que diga la IA.
const draftSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true },
    // Pedido validado (createOrderSchema) con los ids reales del menú.
    input: { type: Mixed, required: true },
    totalCents: { type: Number, required: true },
    quotedAt: { type: Date, required: true },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    commerce: { type: ObjectId, ref: "Commerce", required: true, index: true },
    channel: { type: String, enum: CONVERSATION_CHANNELS, required: true },
    customer: {
      // E.164. En WhatsApp lo confirma WhatsApp mismo; en el simulador lo elige el local.
      phone: { type: String, default: "" },
      name: { type: String, trim: true, maxlength: 60, default: "" },
    },
    // wa_id tal como lo manda WhatsApp (sin +): se le contesta a ese.
    waId: { type: String, default: null },
    locale: { type: String, enum: ORDER_LOCALES, default: "pt-BR" },
    status: { type: String, enum: CONVERSATION_STATUSES, default: "bot" },
    // Por qué pasó a una persona (lo muestra el panel).
    handoff: {
      type: new mongoose.Schema({ reason: String, at: Date }, { _id: false }),
      default: null,
    },
    // Simulador en modo prueba: los pedidos se cotizan pero no se guardan.
    testMode: { type: Boolean, default: false },
    draft: { type: draftSchema, default: null },
    draftCount: { type: Number, default: 0 },
    orders: { type: [{ type: ObjectId, ref: "Order" }], default: [] },
    // Para la ventana de 24 h de WhatsApp: solo se le puede escribir hasta 24 h después.
    lastCustomerMessageAt: { type: Date, default: null },
    lastMessageAt: { type: Date, default: () => new Date() },
    // El comienzo del último mensaje y de quién es, para la lista del panel: si la atiende
    // una persona y lo último no es del local, alguien tiene que contestar.
    preview: { type: String, default: "" },
    lastRole: { type: String, enum: ["customer", "assistant", "staff", null], default: null },
    usage: usageFields,
  },
  { timestamps: true, versionKey: false }
);

conversationSchema.index({ commerce: 1, lastMessageAt: -1 });
conversationSchema.index({ commerce: 1, channel: 1, waId: 1, status: 1 });

export default mongoose.models.Conversation || mongoose.model("Conversation", conversationSchema);
