import mongoose from "mongoose";

// Cómo suma el grupo al precio: sum (cada opción suma), max (vale la más cara: pizza
// meio a meio) o average (el promedio de las elegidas).
export const PRICING_RULES = ["sum", "max", "average"];

const cents = { type: Number, default: 0, min: 0, validate: Number.isInteger };

const optionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  priceCents: cents,
  // Cuántas veces se puede elegir la misma opción ("2x bacon").
  maxQuantity: { type: Number, default: 1, min: 1, validate: Number.isInteger },
  // Agotada: se apaga en todos los productos que usan el grupo.
  available: { type: Boolean, default: true },
  translations: { es: { name: { type: String, default: "" } } },
});

// Grupo de opciones del local ("Ponto da carne", "Adicionais"), compartido entre productos.
// minSelect y maxSelect cuentan unidades (2x bacon = 2).
const optionGroupSchema = new mongoose.Schema(
  {
    commerce: { type: mongoose.Schema.Types.ObjectId, ref: "Commerce", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    minSelect: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    maxSelect: { type: Number, default: 1, min: 1, validate: Number.isInteger },
    pricing: { type: String, enum: PRICING_RULES, default: "sum" },
    options: { type: [optionSchema], default: [] },
    translations: { es: { name: { type: String, default: "" } } },
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.models.OptionGroup || mongoose.model("OptionGroup", optionGroupSchema);
