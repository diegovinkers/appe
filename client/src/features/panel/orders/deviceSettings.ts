import { useEffect, useSyncExternalStore } from "react";

// Avisos, impresión y tamaño de pantalla de este aparato: la tablet de la cocina puede sonar e
// imprimir sola y el celular del dueño no. Quedan en el navegador; sin almacenamiento valen
// hasta recargar.
export type Density = "compact" | "comfortable";
export type DeviceSettings = { sound: boolean; autoPrint: boolean; paper: 58 | 80; density: Density };

const KEYS: Record<keyof DeviceSettings, string> = {
  sound: "painel.som",
  autoPrint: "painel.imprimir-ao-confirmar",
  paper: "painel.papel-comanda",
  density: "painel.tamanho-tela",
};

function read(): DeviceSettings {
  try {
    return {
      // El sonido viene prendido: un pedido sin aviso es peor que un pitido de más.
      sound: localStorage.getItem(KEYS.sound) !== "0",
      autoPrint: localStorage.getItem(KEYS.autoPrint) === "1",
      paper: localStorage.getItem(KEYS.paper) === "58" ? 58 : 80,
      // Compacto por defecto: en la PC entra más; en el celular no cambia nada.
      density: localStorage.getItem(KEYS.density) === "comfortable" ? "comfortable" : "compact",
    };
  } catch {
    return { sound: true, autoPrint: false, paper: 80, density: "compact" };
  }
}

let current = read();
const listeners = new Set<() => void>();

export const getDeviceSettings = () => current;

export function setDeviceSetting<K extends keyof DeviceSettings>(key: K, value: DeviceSettings[K]) {
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(KEYS[key], typeof value === "boolean" ? (value ? "1" : "0") : String(value));
  } catch {
    // Sin almacenamiento: vale hasta recargar la página.
  }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useDeviceSettings = () => useSyncExternalStore(subscribe, getDeviceSettings, getDeviceSettings);

// Dónde aplica el tamaño compacto: pantalla de PC con mouse. En el celular y en la tablet táctil
// los controles siguen del tamaño del dedo. Igual que la regla de styles.css.
export const DENSITY_QUERY = "(min-width: 1024px) and (pointer: fine)";

// Mientras el panel está abierto, <html data-density> elige el tamaño (styles.css). El menú
// público no lo lleva: se ve siempre igual.
export function useDensity() {
  const { density } = useDeviceSettings();
  useEffect(() => {
    document.documentElement.dataset.density = density;
    return () => {
      delete document.documentElement.dataset.density;
    };
  }, [density]);
}
