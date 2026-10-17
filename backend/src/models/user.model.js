import mongoose from "mongoose";

// Permisos de cada rol: src/lib/permissions.js
export const ROLES = ["superadmin", "owner", "staff"];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    // Los empleados que entran solo con PIN no tienen email ni contraseña.
    email: { type: String, lowercase: true, trim: true, maxlength: 254, default: undefined },
    passwordHash: {
      type: String,
      select: false,
      required: function () {
        return !(this instanceof mongoose.Query) && !this.pinHash;
      },
    },
    // PIN de 4 a 6 dígitos para entrar desde un aparato del equipo (ver device.controller.js).
    pinHash: { type: String, select: false, default: undefined },
    pinFailures: { type: Number, default: 0, select: false },
    pinLockedUntil: { type: Date, default: null, select: false },
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
        delete ret.pinHash;
        delete ret.pinFailures;
        delete ret.pinLockedUntil;
        return ret;
      },
    },
  }
);

// Email único solo entre los que tienen: los empleados con PIN no tienen y no chocan entre sí.
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });

export default mongoose.models.User || mongoose.model("User", userSchema);
