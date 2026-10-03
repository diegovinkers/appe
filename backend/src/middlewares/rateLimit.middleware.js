import { rateLimit } from "express-rate-limit";
import { isTest } from "../config.js";

// Límites por IP. Son generosos porque en ciudades chicas muchos celulares salen a
// internet por la misma IP de la operadora.
export const DEFAULT_LIMITS = {
  login: { windowMs: 15 * 60 * 1000, limit: isTest ? 1000 : 10 },
  orders: { windowMs: 10 * 60 * 1000, limit: isTest ? 1000 : 30 },
  // Validar cupones: evita que alguien pruebe códigos a fuerza bruta.
  coupons: { windowMs: 10 * 60 * 1000, limit: isTest ? 1000 : 30 },
  reviews: { windowMs: 10 * 60 * 1000, limit: isTest ? 1000 : 20 },
  // Entrar o crear la cuenta de cliente (y borrarla, que pide la contraseña).
  customerAuth: { windowMs: 15 * 60 * 1000, limit: isTest ? 1000 : 10 },
};

const MESSAGES = {
  login: "Muitas tentativas de login. Tente novamente em alguns minutos.",
  orders: "Muitos pedidos em pouco tempo. Tente novamente em alguns minutos.",
  coupons: "Muitas tentativas de cupom. Tente novamente em alguns minutos.",
  reviews: "Muitas avaliações em pouco tempo. Tente novamente em alguns minutos.",
  customerAuth: "Muitas tentativas de entrar. Tente novamente em alguns minutos.",
};

export const createLimiter = (name, overrides = {}) => {
  const { windowMs, limit } = { ...DEFAULT_LIMITS[name], ...overrides };
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({ error: { code: "TOO_MANY_REQUESTS", message: MESSAGES[name] } }),
  });
};
