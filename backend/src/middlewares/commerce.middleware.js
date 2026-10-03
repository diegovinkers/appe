import Commerce from "../models/commerce.model.js";
import { forbidden } from "../lib/errors.js";

// Carga el local del dueño con sesión en req.commerce. Todo lo de /api/owner
// filtra por req.commerce._id: nunca por un id que venga del body o de la URL.
export const requireOwnerCommerce = async (req, res, next) => {
  const commerce = req.user?.commerce ? await Commerce.findById(req.user.commerce) : null;
  if (!commerce) throw forbidden("NO_COMMERCE", "Sua conta não tem um estabelecimento");
  if (commerce.status !== "active") {
    throw forbidden("COMMERCE_SUSPENDED", "Este estabelecimento está suspenso. Fale com o suporte.");
  }
  req.commerce = commerce;
  next();
};
