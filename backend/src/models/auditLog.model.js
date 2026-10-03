import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;
const RETENTION_DAYS = 180;

// Quién hizo qué: cambios de precio y configuración, cancelaciones, acciones del superadmin.
const auditLogSchema = new mongoose.Schema(
  {
    // Vacío en acciones de la plataforma que no son de un local.
    commerce: { type: ObjectId, ref: "Commerce" },
    actor: {
      user: { type: ObjectId, ref: "User" },
      role: { type: String },
    },
    // "<entidad>.<acción>", ej. "product.price_changed".
    action: { type: String, required: true },
    entity: {
      type: { type: String },
      id: { type: ObjectId },
    },
    // Lo que cambió: { campo: [antes, después] } o un resumen.
    changes: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

auditLogSchema.index({ commerce: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 });

export default mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
