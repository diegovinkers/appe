import mongoose from "mongoose";
import { PAYMENT_METHODS } from "./commerce.model.js";

const { ObjectId } = mongoose.Schema.Types;

// open: la mesa está consumiendo. bill_requested: pidió la cuenta. closed: se cobró.
export const TAB_STATUSES = ["open", "bill_requested", "closed"];

// La cuenta de una mesa: se abre con el primer pedido, junta los pedidos de esa mesa y se
// cierra cobrando. Los pedidos apuntan a la cuenta (order.tab); acá no se repiten.
const tabSchema = new mongoose.Schema(
  {
    commerce: { type: ObjectId, ref: "Commerce", required: true, index: true },
    table: { type: ObjectId, ref: "Table", required: true },
    // Copia del número, para la precuenta y la historia aunque la mesa cambie.
    tableNumber: { type: Number, required: true },
    status: { type: String, enum: TAB_STATUSES, default: "open" },
    // La mesa mientras la cuenta está abierta: el índice único impide dos cuentas abiertas
    // en la misma mesa. Al cerrar se borra.
    openTable: { type: ObjectId, default: undefined },
    openedBy: { type: ObjectId, ref: "User" },
    billRequestedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    closedBy: { type: ObjectId, ref: "User", default: null },
    // Con un solo pago, su forma (como antes); dividida, null y el detalle en `payments`.
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: null },
    changeForCents: { type: Number, default: null },
    // Lo cobrado, pago por pago (uno, o una parte por persona si se dividió). Suman el total.
    payments: {
      type: [
        new mongoose.Schema(
          {
            paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
            amountCents: { type: Number, required: true, min: 1, validate: Number.isInteger },
            changeForCents: { type: Number, default: null },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    // Lo cobrado al cerrar (suma de los pedidos no cancelados).
    totalCents: { type: Number, default: 0, min: 0, validate: Number.isInteger },
  },
  { timestamps: true, versionKey: false }
);

tabSchema.index({ commerce: 1, openTable: 1 }, { unique: true, partialFilterExpression: { openTable: { $exists: true } } });
tabSchema.index({ commerce: 1, table: 1, createdAt: -1 });

export default mongoose.models.Tab || mongoose.model("Tab", tabSchema);
