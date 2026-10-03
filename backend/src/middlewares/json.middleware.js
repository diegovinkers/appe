import { AppError } from "../lib/errors.js";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Defensa contra CSRF (además de la cookie SameSite=Lax): un formulario de otro sitio
// puede mandar urlencoded, multipart o text/plain, pero nunca application/json.
// Un request sin body y sin Content-Type (ej. un DELETE) pasa.
// `except`: prefijos que reciben otros formatos (webhooks de terceros).
export const requireJsonContentType = ({ except = [] } = {}) => (req, res, next) => {
  if (!WRITE_METHODS.has(req.method) || except.some((prefix) => req.path.startsWith(prefix))) return next();

  const contentType = req.headers["content-type"];
  const mediaType = contentType?.split(";")[0].trim().toLowerCase();
  if (contentType !== undefined && mediaType !== "application/json") {
    throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Envie os dados em formato JSON");
  }
  next();
};
