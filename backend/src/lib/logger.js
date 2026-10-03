import pino from "pino";
import { config, isProduction, isTest } from "../config.js";

// Logs estructurados: en producción, una línea JSON por evento; en desarrollo, legibles.
// Nunca bodies, cookies ni headers: tienen datos personales y la sesión.
export const logger = pino({
  level: isTest ? "silent" : config.LOG_LEVEL,
  ...(!isProduction && !isTest
    ? {
        transport: {
          target: "pino-pretty",
          // En desarrollo, una línea por request: el mensaje ya dice método, ruta, estado y tiempo.
          options: { translateTime: "HH:MM:ss", ignore: "pid,hostname,req,res,responseTime" },
        },
      }
    : {}),
});
