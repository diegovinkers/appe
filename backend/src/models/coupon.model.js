import mongoose from "mongoose";

// percent: % del subtotal; fixed: valor fijo en centavos; free_delivery: la entrega sale grátis.
export const COUPON_TYPES = ["percent", "fixed", "free_delivery"];

const couponSchema = new mongoose.Schema(
  {
    commerce: { type: mongoose.Schema.Types.ObjectId, ref: "Commerce", required: true, index: true },
    // Siempre en mayúsculas: "demo10" y "DEMO10" son el mismo cupón.
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 },
    type: { type: String, enum: COUPON_TYPES, required: true },
    // Porcentaje (1 a 100) o centavos, según el tipo. En free_delivery no se usa.
    value: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    // Subtotal mínimo para usarlo. 0 = sin mínimo.
    minOrderCents: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    // Usos totales y por cliente (por teléfono). null = sin límite.
    maxUses: { type: Number, default: null },
    maxUsesPerCustomer: { type: Number, default: null },
    // Pedidos no cancelados que lo usaron (se incrementa en la transacción del pedido).
    uses: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
    // Nota interna del dueño ("campanha do Instagram").
    description: { type: String, trim: true, maxlength: 140, default: "" },
  },
  { timestamps: true, versionKey: false }
);

couponSchema.index({ commerce: 1, code: 1 }, { unique: true });

export default mongoose.models.Coupon || mongoose.model("Coupon", couponSchema);
