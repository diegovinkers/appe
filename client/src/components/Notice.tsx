import type { ReactNode } from "react";

// Un aviso dentro de un formulario: el error de lo que se acaba de intentar o un dato para seguir.
// El mismo en el panel y en la cuenta del cliente.
const TONES = {
  error: "bg-error-soft text-error ring-error/30",
  warning: "bg-[#fff4d6] text-[#7a4e00] ring-[#f0d48a]",
  success: "bg-[#e3f4ea] text-[#16603b] ring-[#b4dcc4]",
};

export function Notice({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-lg px-3 py-2.5 ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </p>
  );
}
