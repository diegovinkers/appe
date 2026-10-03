import mongoose from "mongoose";

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
