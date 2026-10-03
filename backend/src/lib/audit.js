import AuditLog from "../models/auditLog.model.js";

// Registra una acción en la auditoría. Si falla, se loguea y la acción del usuario
// sigue: la auditoría no puede tumbar un pedido ni un cambio de precio.
export async function audit(req, { action, entity, changes, commerce = req.commerce?._id }) {
  try {
    await AuditLog.create({
      commerce,
      actor: { user: req.user?.id, role: req.user?.role },
      action,
      entity,
      changes,
    });
  } catch (error) {
    req.log?.error({ err: error, action }, "no se pudo registrar la auditoría");
  }
}

// { campo: [antes, después] } solo con los campos que cambiaron.
export function diffFields(before, after, fields) {
  const changes = {};
  for (const field of fields) {
    const from = before[field];
    const to = after[field];
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[field] = [from, to];
  }
  return changes;
}
