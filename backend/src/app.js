import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import mongoose from "mongoose";
import { pinoHttp } from "pino-http";
import { config } from "./config.js";
import { logger } from "./lib/logger.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import adminRouter from "./routes/admin.routes.js";
import ownerRouter from "./routes/owner.routes.js";
import { createPublicRouter } from "./routes/public.routes.js";
import { createCustomerRouter } from "./routes/customer.routes.js";
import whatsappRouter from "./routes/whatsapp.routes.js";
import { createLimiter } from "./middlewares/rateLimit.middleware.js";
import { requireJsonContentType } from "./middlewares/json.middleware.js";
import { errorHandler, routeNotFound } from "./middlewares/error.middleware.js";

// Routers de la API por prefijo. Los tests los recorren para comparar con el OpenAPI.
export function createApiRouters({ limits = {} } = {}) {
  return {
    "/api/auth": createAuthRouter({ loginLimiter: createLimiter("login", limits.login) }),
    "/api/public": createPublicRouter({
      orderLimiter: createLimiter("orders", limits.orders),
      couponLimiter: createLimiter("coupons", limits.coupons),
      reviewLimiter: createLimiter("reviews", limits.reviews),
    }),
    "/api/customer": createCustomerRouter({ authLimiter: createLimiter("customerAuth", limits.customerAuth) }),
    "/api/owner": ownerRouter,
    "/api/admin": adminRouter,
    "/api/whatsapp": whatsappRouter,
  };
}

export const healthCheck = (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.status(dbConnected ? 200 : 503).json({ ok: dbConnected });
};

// `limits` permite cambiar los rate limits (lo usan los tests).
export function createApp({ limits = {} } = {}) {
  const app = express();

  app.set("trust proxy", config.TRUST_PROXY);
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true, exposedHeaders: ["X-Request-Id"] }));
  // Una línea por request con método, ruta, estado y duración; nunca headers ni bodies.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = randomUUID();
        res.setHeader("X-Request-Id", id);
        return id;
      },
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
      customSuccessMessage: (req, res, responseTime) =>
        `${req.method} ${req.originalUrl} → ${res.statusCode} (${Math.round(responseTime)} ms)`,
      customErrorMessage: (req, res) => `${req.method} ${req.originalUrl} → ${res.statusCode}`,
    })
  );
  app.use(requireJsonContentType());
  // Notas de voz del simulador (base64): más grandes que el resto de los pedidos a la API.
  app.use("/api/owner/assistant/simulator/audio", express.json({ limit: "2mb" }));
  // El webhook de WhatsApp necesita el cuerpo tal como llegó para chequear la firma de Meta.
  app.use(
    express.json({
      limit: "100kb",
      verify: (req, res, raw) => {
        if (req.originalUrl.startsWith("/api/whatsapp/")) req.rawBody = raw;
      },
    })
  );
  app.use(cookieParser());

  app.get("/api/health", healthCheck);
  for (const [prefix, router] of Object.entries(createApiRouters({ limits }))) app.use(prefix, router);

  app.use(routeNotFound);
  app.use(errorHandler);
  return app;
}
