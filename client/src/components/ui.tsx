import type { ReactNode } from "react";

// Piezas de formulario del panel, para que todas las pantallas se vean y se usen igual.

const base = "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-4 font-bold disabled:cursor-not-allowed disabled:opacity-50";
export const button = {
  primary: `${base} bg-action text-white hover:bg-action-hover`,
  secondary: `${base} border border-line bg-surface hover:bg-paper`,
  danger: `${base} border border-line bg-surface text-error hover:bg-error-soft`,
  quiet: `${base} px-3 text-ink-muted hover:bg-paper hover:text-ink`,
};

export const input = "h-11 w-full rounded-lg border border-line bg-surface px-3 aria-invalid:border-closed disabled:bg-paper";
export const textarea = "block w-full rounded-lg border border-line bg-surface px-3 py-2 aria-invalid:border-closed";

export function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-bold">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-erro`} className="mt-1 text-sm font-bold text-error">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>
      )}
    </div>
  );
}

// Interruptor de sí/no (disponible, destacado, activo…). El texto va en label (visible o no).
export function Switch({
  checked,
  onChange,
  label,
  showLabel = true,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  showLabel?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={showLabel ? undefined : label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-fit items-center gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span aria-hidden className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-open" : "bg-line"}`}>
        <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-[left] ${checked ? "left-6" : "left-1"}`} />
      </span>
      {showLabel && <span>{label}</span>}
    </button>
  );
}
