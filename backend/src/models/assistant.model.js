import mongoose from "mongoose";

// Cuánto después de la entrega se pide la reseña sola (minutos).
export const REVIEW_DELAY_OPTIONS = [30, 60, 120, 180];
export const DEFAULT_REVIEW_DELAY = 60;

// Configuración del asistente con IA de un local (uno por local; se crea al configurarlo).
const assistantSchema = new mongoose.Schema(
  {
    commerce: { type: mongoose.Schema.Types.ObjectId, ref: "Commerce", required: true, unique: true },
    // Atiende por WhatsApp. El simulador del panel anda aunque esté apagado.
    enabled: { type: Boolean, default: false },
    // Id del número de WhatsApp Business (lo da Meta): lo que llega a ese número es de este local.
    phoneNumberId: { type: String, trim: true, default: null },
    // wa_id de clientes a los que el comercio pidió no volver a automatizar.
    blockedWaIds: { type: [String], default: [] },
    // Tope de gasto de IA por mes, en centavos de dólar (1000 = US$ 10). Al llegar, el
    // asistente deja de contestar y pasa las conversaciones a una persona.
    monthlyBudgetUsdCents: { type: Number, default: 1000, min: 0, validate: Number.isInteger },
    // Contestar también con una nota de voz cuando el cliente manda audio.
    voiceReplies: { type: Boolean, default: false },
    // Pedir la reseña sola por WhatsApp, `reviewDelayMinutes` después de entregado el pedido.
    autoReviewRequest: { type: Boolean, default: false },
    reviewDelayMinutes: { type: Number, enum: REVIEW_DELAY_OPTIONS, default: DEFAULT_REVIEW_DELAY },
  },
  { timestamps: true, versionKey: false }
);

assistantSchema.index({ phoneNumberId: 1 }, { unique: true, partialFilterExpression: { phoneNumberId: { $type: "string" } } });

export default mongoose.models.Assistant || mongoose.model("Assistant", assistantSchema);
