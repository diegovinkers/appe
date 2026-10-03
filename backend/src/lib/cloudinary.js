// Imágenes con Cloudinary: el backend firma la subida y el navegador sube directo.
// Si CLOUDINARY_URL no está, la subida queda desactivada y se aceptan URLs https comunes.
import { createHash } from "node:crypto";
import { config } from "../config.js";
import { AppError, badRequest } from "./errors.js";

export const ALLOWED_FORMATS = "jpg,jpeg,png,webp,heic";

// Se lee en cada llamada (no al importar) para que los tests puedan desactivarlo.
export function getCloudinary() {
  const match = config.CLOUDINARY_URL?.match(/^cloudinary:\/\/(\d+):([^@\s]+)@([\w-]+)$/);
  return match ? { apiKey: match[1], apiSecret: match[2], cloudName: match[3] } : null;
}

export function requireCloudinary() {
  const cloudinary = getCloudinary();
  if (!cloudinary) throw new AppError(503, "FEATURE_DISABLED", "O envio de imagens não está disponível no momento");
  return cloudinary;
}

// Firma de Cloudinary: parámetros ordenados como "a=1&b=2", más el secret, en SHA-1.
export function signParams(params, apiSecret) {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(payload + apiSecret).digest("hex");
}

// Cada local sube a su propia carpeta.
export const folderFor = (commerceId, kind) => `app-pedidos/${commerceId}/${kind}`;

// Con Cloudinary activo, una imagen guardada tiene que ser de nuestro cloud y de la
// carpeta del local: nadie puede apuntar a imágenes de otros ni a sitios externos.
export function checkImageUrl(url, commerceId, field) {
  const cloudinary = getCloudinary();
  if (!url || !cloudinary) return;
  const ours = url.startsWith(`https://res.cloudinary.com/${cloudinary.cloudName}/image/upload/`);
  if (!ours || !url.includes(`/app-pedidos/${commerceId}/`)) {
    throw badRequest("INVALID_IMAGE_URL", "Use uma imagem enviada pelo painel", [
      { location: "body", path: field, message: "Imagem inválida" },
    ]);
  }
}
