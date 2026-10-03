import mongoose from "mongoose";

// Disponibilidad por horario (ej. "Café da manhã" de 7:00 a 11:00). Fuera de ese
// horario la categoría se muestra, pero sus productos no se pueden pedir.
// `days` vacío = todos los días.
const scheduleSchema = new mongoose.Schema(
  { days: { type: [String], default: [] }, from: String, to: String },
  { _id: false }
);

const categorySchema = new mongoose.Schema(
  {
    commerce: { type: mongoose.Schema.Types.ObjectId, ref: "Commerce", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    position: { type: Number, default: 0 },
    // Inactiva: no aparece en el menú público.
    active: { type: Boolean, default: true },
    schedule: { type: scheduleSchema, default: null },
    translations: { es: { name: { type: String, default: "" } } },
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.models.Category || mongoose.model("Category", categorySchema);
