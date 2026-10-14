import { Check, Copy } from "lucide-react";
import { useState } from "react";

// Copia un texto (la chave Pix, un link) y lo confirma un momento en el mismo botón.
export function CopyButton({ text, label, copiedLabel, className = "" }: { text: string; label: string; copiedLabel: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Sin permiso de portapapeles: el texto queda a la vista para copiarlo a mano.
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={`inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 font-bold hover:bg-paper ${className}`}
    >
      {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  );
}
