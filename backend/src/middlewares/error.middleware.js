import { AppError } from "../lib/errors.js";

const sendError = (res, status, code, message, details) => {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  res.status(status).json({ error });
};

export const routeNotFound = (req, res) => sendError(res, 404, "ROUTE_NOT_FOUND", "Rota não encontrada");

// Único lugar donde se responden errores. El detalle interno se loguea en el
// servidor y nunca llega al cliente; el requestId sirve para encontrarlo en los logs.
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  if (err instanceof AppError) return sendError(res, err.status, err.code, err.message, err.details);
  if (err.type === "entity.parse.failed") return sendError(res, 400, "INVALID_JSON", "JSON inválido");
  if (err.type === "entity.too.large") return sendError(res, 413, "PAYLOAD_TOO_LARGE", "Dados grandes demais");
  if (err.code === 11000) return sendError(res, 409, "DUPLICATE", "Já existe um registro com esses dados");
  if (err.name === "ValidationError" || err.name === "CastError") {
    return sendError(res, 400, "VALIDATION_ERROR", "Dados inválidos");
  }

  req.log?.error({ err }, "error inesperado");
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor", requestId: req.id } });
};
