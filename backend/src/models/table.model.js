import mongoose from "mongoose";

// Lugar de una mesa en el plano del salón: una celda de la grilla (columna x, fila y).
export const GRID_COLUMNS = 24;
export const GRID_ROWS = 24;

const cell = (max) => ({ type: Number, required: true, min: 0, max: max - 1, validate: Number.isInteger });

// Mesa del salón del local. El estado (libre, ocupada…) no se guarda: sale de su cuenta abierta.
const tableSchema = new mongoose.Schema(
  {
    commerce: { type: mongoose.Schema.Types.ObjectId, ref: "Commerce", required: true, index: true },
    number: { type: Number, required: true, min: 1, max: 999, validate: Number.isInteger },
    // Opcional: "Terraço 2", "Balcão".
    name: { type: String, trim: true, maxlength: 30, default: "" },
    seats: { type: Number, default: 4, min: 1, max: 30, validate: Number.isInteger },
    x: cell(GRID_COLUMNS),
    y: cell(GRID_ROWS),
    // Desactivada: no aparece en el salón, pero conserva su historia.
    active: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

tableSchema.index({ commerce: 1, number: 1 }, { unique: true });

export default mongoose.models.Table || mongoose.model("Table", tableSchema);
