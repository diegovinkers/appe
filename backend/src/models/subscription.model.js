import mongoose from "mongoose";

// Planes de la plataforma: Plus suma el asistente de WhatsApp. Antes Plus se llamaba
// "Member Plus": lo que quedó guardado así cuenta (y se muestra) como Plus.
export const SUBSCRIPTION_PLANS = ["Essencial", "Plus"];
const normalized = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase();
export const planName = (value) => (["plus", "member plus"].includes(normalized(value)) ? "Plus" : (value ?? "Essencial"));

const subscriptionSchema = new mongoose.Schema({
  commerce: { type: mongoose.Schema.Types.ObjectId, ref: "Commerce", required: true, unique: true },
  plan: { type: String, default: "Essencial" },
  priceCents: { type: Number, default: 7990, min: 0, validate: Number.isInteger },
  dueDate: { type: String, default: null },
  status: { type: String, enum: ["trial", "active", "cancelled"], default: "trial" },
  payments: { type: [new mongoose.Schema({
    reference: { type: String, required: true },
    amountCents: { type: Number, required: true, min: 1, validate: Number.isInteger },
    paidAt: { type: Date, required: true },
    period: { type: String, required: true },
    note: { type: String, default: "" },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  }, { _id: false })], default: [] },
}, { timestamps: true, versionKey: false });
export default mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);
