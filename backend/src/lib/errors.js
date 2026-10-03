// Errores de la API: un código estable en inglés (el front lo traduce)
// y un mensaje en portugués de Brasil (lo ve el usuario).
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code, message, details) => new AppError(400, code, message, details);

export const unauthorized = (message = "Faça login para continuar") =>
  new AppError(401, "UNAUTHENTICATED", message);

export const forbidden = (code = "FORBIDDEN", message = "Você não tem permissão para fazer isso") =>
  new AppError(403, code, message);

export const notFound = (message = "Não encontrado") => new AppError(404, "NOT_FOUND", message);

export const conflict = (code, message, details) => new AppError(409, code, message, details);
