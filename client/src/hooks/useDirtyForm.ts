import { useEffect } from "react";
import { useBlocker } from "react-router";
import { useLanguage } from "../i18n";

// Protege tanto los enlaces del panel como recargar/cerrar la pestaña.
export function useDirtyForm(dirty: boolean) {
  const language = useLanguage();
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    const message = language === "es" ? "Hay cambios sin guardar. ¿Querés salir y descartarlos?" : "Há alterações não salvas. Sair e descartar?";
    if (window.confirm(message)) blocker.proceed();
    else blocker.reset();
  }, [blocker, language]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
}
