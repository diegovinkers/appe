import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { useT } from "../i18n";

type Props = { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode };

// Hoja que sube desde abajo en el celular y se centra en la PC. Es un <dialog> modal:
// el navegador se encarga del foco, de Esc y de tapar lo de atrás.
export function Sheet({ open, onClose, title, children, footer }: Props) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // La página de atrás no se mueve mientras la hoja está abierta.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Esc cierra el <dialog> solo; se avisa para que la página lo sepa. Si la página
      // ya lo cerró (open=false), no se avisa de nuevo.
      onClose={() => open && onClose()}
      // Tocar fuera de la hoja la cierra.
      onClick={(event) => event.target === event.currentTarget && onClose()}
      className="mx-0 mt-auto mb-0 max-h-[92dvh] w-full max-w-none rounded-t-2xl bg-surface p-0 text-ink shadow-xl backdrop:bg-black/50 sm:m-auto sm:max-w-lg sm:rounded-2xl"
    >
      <div className="flex max-h-[92dvh] flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-line py-2 pr-2 pl-4">
          <h2 id={titleId} className="min-w-0 flex-1 text-lg leading-tight font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="grid size-11 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-paper hover:text-ink"
          >
            <X aria-hidden className="size-6" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="shrink-0 border-t border-line bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </dialog>
  );
}
