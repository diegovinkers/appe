import mongoose from "mongoose";

// Reseña que deja el cliente después de recibir su pedido: una por pedido. El local puede
// ocultarla del menú público, pero no editarla ni borrarla.
const reviewSchema = new mongoose.Schema(
  {
    commerce: { type: mongoose.Schema.Types.ObjectId, ref: "Commerce", required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, unique: true },
    orderNumber: { type: Number, required: true },
    // Solo el primer nombre: es lo que se muestra en el menú.
    customerName: { type: String, required: true, trim: true, maxlength: 60 },
    rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
    comment: { type: String, trim: true, maxlength: 500, default: "" },
    hidden: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

// Las del menú público (visibles, más nuevas primero) y el promedio por local.
reviewSchema.index({ commerce: 1, hidden: 1, createdAt: -1 });

export default mongoose.models.Review || mongoose.model("Review", reviewSchema);
