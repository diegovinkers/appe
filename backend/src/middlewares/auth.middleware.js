import User from "../models/user.model.js";
import { readSession } from "../lib/session.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import { PERMISSIONS, hasPermission } from "../lib/permissions.js";

// Carga el usuario de la base en cada request: un usuario desactivado o con la
// contraseña cambiada (tokenVersion distinto) pierde la sesión en el acto.
export const authRequired = async (req, res, next) => {
  const session = readSession(req);
  if (!session) throw unauthorized();

  const user = await User.findById(session.sub).select("+tokenVersion");
  if (!user || !user.active || user.tokenVersion !== session.v) {
    throw unauthorized("Sua sessão expirou. Faça login novamente");
  }

  req.user = {
    id: String(user._id),
    role: user.role,
    commerce: user.commerce ? String(user.commerce) : null,
  };
  next();
};

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) throw forbidden();
  next();
};

export const requirePermission = (permission) => {
  // Un permiso mal escrito se detecta al arrancar, no en producción.
  if (!PERMISSIONS.includes(permission)) throw new Error(`Permiso desconocido: ${permission}`);
  return (req, res, next) => {
    if (!hasPermission(req.user?.role, permission)) throw forbidden();
    next();
  };
};
