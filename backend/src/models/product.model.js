import mongoose from "mongoose";

// vegetariano, vegano, sem glúten, picante, novo
export const PRODUCT_TAGS = ["vegetarian", "vegan", "gluten_free", "spicy", "new"];

const productSchema = new mongoose.Schema(
  {
    commerce: { type: mongoose.Schema.Types.ObjectId, ref: "Commerce", required: true, index: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300, default: "" },
    priceCents: { type: Number, required: true, min: 0, validate: Number.isInteger },
    // Precio promocional ("de R$ X por R$ Y"), con vigencia opcional. El que vale
    // en cada momento lo calcula src/services/pricing.service.js.
    promoPriceCents: { type: Number, default: null },
    promoStartsAt: { type: Date, default: null },
    promoEndsAt: { type: Date, default: null },
    imageUrl: { type: String, trim: true, maxlength: 500, default: "" },
    tags: { type: [{ type: String, enum: PRODUCT_TAGS }], default: [] },
    // Aparece en la sección "Destaques" del menú.
    featured: { type: Boolean, default: false },
    // Agotado a mano: se sigue mostrando, marcado, pero no se puede pedir.
    available: { type: Boolean, default: true },
    // Stock opcional: se descuenta con cada pedido y en 0 queda agotado solo.
    trackStock: { type: Boolean, default: false },
    stock: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    position: { type: Number, default: 0 },
    // Grupos de opciones del mismo local, en el orden en que se muestran.
    optionGroups: [{ type: mongoose.Schema.Types.ObjectId, ref: "OptionGroup" }],
    translations: {
      es: {
        name: { type: String, default: "" },
        description: { type: String, default: "" },
      },
    },
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.models.Product || mongoose.model("Product", productSchema);
