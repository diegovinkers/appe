import { useSyncExternalStore } from "react";

// Avisos e impresión de este aparato: la tablet de la cocina puede sonar e imprimir sola y el
// celular del dueño no. Quedan en el navegador; sin almacenamiento valen hasta recargar.
export type DeviceSettings = { sound: boolean; autoPrint: boolean; paper: 58 | 80 };

const KEYS: Record<keyof DeviceSettings, string> = {
  sound: "painel.som",
  autoPrint: "painel.imprimir-ao-confirmar",
  paper: "painel.papel-comanda",
};

function read(): DeviceSettings {
  try {
    return {
      // El sonido viene prendido: un pedido sin aviso es peor que un pitido de más.
      sound: localStorage.getItem(KEYS.sound) !== "0",
      autoPrint: localStorage.getItem(KEYS.autoPrint) === "1",
      paper: localStorage.getItem(KEYS.paper) === "58" ? 58 : 80,
    };
  } catch {
    return { sound: true, autoPrint: false, paper: 80 };
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
