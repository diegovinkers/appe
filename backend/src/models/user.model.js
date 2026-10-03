import mongoose from "mongoose";

// Permisos de cada rol: src/lib/permissions.js
export const ROLES = ["superadmin", "owner", "staff"];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    // Local del dueño o del empleado.
    commerce: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Commerce",
      index: true,
      required: function () {
        // En los validadores de un update, `this` es la query: el rol sale del update.
        // Si el update no toca el rol, no se puede saber y no se exige.
        if (this instanceof mongoose.Query) {
          const update = this.getUpdate() ?? {};
          const role = update.$set?.role ?? update.role;
          return role !== undefined && role !== "superadmin";
        }
        return this.role !== "superadmin";
      },
    },
    active: { type: Boolean, default: true },
    // Sube al cambiar o resetear la contraseña: invalida las sesiones anteriores.
    tokenVersion: { type: Number, default: 0, select: false },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.passwordHash;
        delete ret.tokenVersion;
        return ret;
      },
    },
  }
);

export default mongoose.models.User || mongoose.model("User", userSchema);
