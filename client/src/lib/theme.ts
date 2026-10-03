import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "serice.theme";
const listeners = new Set<() => void>();
let current: Theme = typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light";

function apply(next: Theme) {
  current = next;
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#121a17" : "#f4f6f5");
  listeners.forEach((listener) => listener());
}

export function setTheme(next: Theme) {
  apply(next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // En navegadores sin almacenamiento, la elección dura esta visita.
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY && (event.newValue === "light" || event.newValue === "dark")) apply(event.newValue);
  });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const useTheme = () => useSyncExternalStore(subscribe, () => current, () => "light" as Theme);
