import { ApiError } from "../api/client";

// Qué sesión venció, según la llamada que respondió 401 UNAUTHENTICATED. Los 401 por datos
// equivocados (INVALID_CREDENTIALS) no cuentan, y /auth/me sin sesión tampoco: ahí no había
// sesión que vencer.
export function expiredSession(error: unknown): "panel" | "customer" | null {
  if (!(error instanceof ApiError) || error.status !== 401 || error.code !== "UNAUTHENTICATED") return null;
  if (error.path.startsWith("/customer/")) return "customer";
  if (/^\/(owner|admin)\//.test(error.path) || error.path === "/auth/password") return "panel";
  return null;
}

// La sesión del panel venció en medio del uso: el guard lo pasa a /entrar para mostrar el aviso.
// Se borra al volver a entrar.
let panelExpired = false;
export const markPanelExpired = () => {
  panelExpired = true;
};
export const panelSessionExpired = () => panelExpired;
export const clearPanelExpired = () => {
  panelExpired = false;
};
