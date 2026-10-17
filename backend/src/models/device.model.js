import mongoose from "mongoose";

// Un aparato del equipo (la tablet del salón, el celular de un mozo): el dueño lo registra y
// desde ahí los empleados entran con su nombre y PIN. El aparato guarda un token en una cookie;
// acá queda solo su hash.
const deviceSchema = new mongoose.Schema(
  {
    commerce: { type: mongoose.Schema.Types.ObjectId, ref: "Commerce", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    tokenHash: { type: String, required: true, unique: true, select: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    lastUsedAt: { type: Date, default: null },
    // Dado de baja: el token deja de valer.
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.models.Device || mongoose.model("Device", deviceSchema);
