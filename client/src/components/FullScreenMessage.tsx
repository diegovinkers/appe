import type { ReactNode } from "react";
import { useT } from "../i18n";

// Pantalla completa para cargando, errores y bloqueos (ej. loja suspensa).
export function FullScreenMessage({ title, children, action }: { title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-4">
      <div className="max-w-sm text-center" role={title ? "alert" : "status"}>
        {title && <h1 className="mb-2 text-xl font-bold">{title}</h1>}
        {children && <div className="text-ink-muted">{children}</div>}
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-3 text-ink-muted">
      <span aria-hidden className="size-5 animate-spin rounded-full border-2 border-line border-t-ink" />
      <span>{label ?? t.loading}…</span>
    </span>
  );
}
