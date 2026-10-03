import { AppError } from "../lib/errors.js";

// Valida params, query y body con schemas Zod y deja lo validado en req.valid.
// Lo que no está en el schema se descarta, así que los controladores usan solo
// req.valid (en Express 5, req.query es de solo lectura y no se puede reemplazar).
export const validate = (schemas) => (req, res, next) => {
  const valid = {};
  const details = [];

  for (const part of ["params", "query", "body"]) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (result.success) {
      valid[part] = result.data;
    } else {
      for (const issue of result.error.issues) {
        details.push({ location: part, path: issue.path.join("."), message: issue.message });
      }
    }
  }

  if (details.length) throw new AppError(400, "VALIDATION_ERROR", "Dados inválidos", details);
  req.valid = valid;
  next();
};
