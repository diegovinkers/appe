import { ApiError } from "../api/client";
import { errorText, useT } from "../i18n";
import { FullScreenMessage } from "./FullScreenMessage";

// No se pudo cargar una pantalla entera: dice si es la conexión o el servidor y ofrece reintentar.
export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useT();
  const hint =
    error instanceof ApiError && error.code !== "NETWORK_ERROR" && error.status < 500 ? errorText(error, t)
    : error instanceof ApiError && error.code === "NETWORK_ERROR" ? t.apiErrors.NETWORK_ERROR
    : t.errors.serverHint;
  return (
    <FullScreenMessage
      title={t.errors.generic}
      action={
        <button type="button" onClick={onRetry} className="h-11 rounded-lg bg-action px-4 font-bold text-white">
          {t.errors.retry}
        </button>
      }
    >
      {hint}
    </FullScreenMessage>
  );
}
