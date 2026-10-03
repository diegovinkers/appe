import mongoose from "mongoose";
import { usageFields } from "./conversation.model.js";

const { ObjectId, Mixed } = mongoose.Schema.Types;

// customer: el cliente. assistant: el asistente con IA. staff: alguien del local desde el panel.
export const MESSAGE_ROLES = ["customer", "assistant", "staff"];
export const MESSAGE_KINDS = ["text", "audio"];

// Un mensaje de una conversación del asistente. Aparte de la conversación (y no en un
// array adentro) para que una conversación larga no crezca sin límite.
const messageSchema = new mongoose.Schema(
  {
    commerce: { type: ObjectId, ref: "Commerce", required: true, index: true },
    conversation: { type: ObjectId, ref: "Conversation", required: true },
    role: { type: String, enum: MESSAGE_ROLES, required: true },
    // En un audio, `text` es la transcripción.
    kind: { type: String, enum: MESSAGE_KINDS, default: "text" },
    text: { type: String, default: "" },
    // Id del mensaje en WhatsApp: el mismo mensaje no se procesa dos veces.
    externalId: { type: String, default: null },
    // Mensajes que salen por WhatsApp: si llegaron a enviarse.
    delivery: { type: String, enum: ["pending", "sent", "failed", null], default: null },
    // Lo que hizo el asistente para contestar (para entender una respuesta desde el panel).
    toolCalls: {
      type: [new mongoose.Schema({ name: String, input: Mixed, output: Mixed }, { _id: false })],
      default: undefined,
    },
    // Solo en las respuestas del asistente.
    model: { type: String, default: undefined },
    usage: { type: new mongoose.Schema(usageFields, { _id: false }), default: undefined },
  },
  { timestamps: true, versionKey: false }
);

messageSchema.index({ conversation: 1, createdAt: 1 });
messageSchema.index({ commerce: 1, createdAt: -1 });
messageSchema.index({ externalId: 1 }, { unique: true, partialFilterExpression: { externalId: { $type: "string" } } });

export default mongoose.models.ConversationMessage || mongoose.model("ConversationMessage", messageSchema);
