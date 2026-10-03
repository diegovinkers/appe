import mongoose from "mongoose";
import { ORDER_LOCALES } from "./order.model.js";

// Dirección guardada del cliente. El barrio va como texto: al pedir en un local que
// entrega por barrios, se busca el suyo por nombre.
const addressSchema = new mongoose.Schema({
  label: { type: String, trim: true, maxlength: 40, default: "" },
  street: { type: String, required: true, trim: true, maxlength: 120 },
  number: { type: String, required: true, trim: true, maxlength: 20 },
  neighborhood: { type: String, required: true, trim: true, maxlength: 80 },
  reference: { type: String, trim: true, maxlength: 120, default: "" },
});

// Cuenta del cliente, la misma para todos los locales. El teléfono todavía no se
// verifica (llega con Auth0): por eso nunca se le asocian pedidos solo por teléfono.
const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    // E.164, ej. +5555999990000.
    phone: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    tokenVersion: { type: Number, default: 0, select: false },
    locale: { type: String, enum: ORDER_LOCALES, default: "pt-BR" },
    addresses: { type: [addressSchema], default: [] },
    lastOrderAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

export const MAX_ADDRESSES = 10;

export default mongoose.models.Customer || mongoose.model("Customer", customerSchema);
