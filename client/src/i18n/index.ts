import { useSyncExternalStore } from "react";
import { ApiError } from "../api/client";
import { es } from "./es";
import { type Dictionary, ptBR } from "./pt-BR";

export type { Dictionary };
export type Language = "pt-BR" | "es";

// Cada idioma con su nombre en ese idioma, como se muestra en el selector.
export const LANGUAGES: { code: Language; name: string }[] = [
  { code: "pt-BR", name: "Português" },
  { code: "es", name: "Español" },
];

const DICTIONARIES: Record<Language, Dictionary> = { "pt-BR": ptBR, es };
const STORAGE_KEY = "painel.idioma";

// Lo elegido en este aparato; si nunca se eligió, el idioma del navegador (español o, si no, portugués).
function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "pt-BR" || saved === "es") return saved;
  } catch {
    // Sin almacenamiento: se decide por el navegador.
  }
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("es") ? "es" : "pt-BR";
}

let current: Language = initialLanguage();
const listeners = new Set<() => void>();

function applyToDocument() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = current;
  document.title = DICTIONARIES[current].panel;
}
applyToDocument();

export const getLanguage = () => current;

// Para funciones fuera de React (formatos, menú, cartel): leen el idioma del momento en que se llaman.
export const getT = () => DICTIONARIES[current];

export function setLanguage(next: Language) {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Sin almacenamiento, vale hasta recargar la página.
  }
  applyToDocument();
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useLanguage = () => useSyncExternalStore(subscribe, getLanguage, getLanguage);

// Los componentes que muestran textos usan esto, así se vuelven a dibujar al cambiar de idioma.
export const useT = () => DICTIONARIES[useLanguage()];

// Mensaje de error para mostrar: la traducción del código si existe; si no, lo que dijo el backend.
export function errorText(error: unknown, t: Dictionary): string {
  if (error instanceof ApiError) return t.apiErrors[error.code] ?? (error.message || t.apiErrors.UNKNOWN);
  return t.apiErrors.UNKNOWN;
}
