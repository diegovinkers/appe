import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import type { Opening, OwnerStore } from "../api/types";
import { navFor } from "../features/panel/nav";
import { statusActions, statusView } from "../features/panel/storeStatus";
import { formatMoney, formatWhen } from "../lib/format";
import { es } from "./es";
import { errorText, getLanguage, getT, setLanguage } from "./index";
import { ptBR } from "./pt-BR";

afterEach(() => setLanguage("pt-BR"));

// La forma del diccionario: claves y tipo de cada valor, sin los textos.
const shape = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shape(inner)]));
  }
  return typeof value;
};

describe("diccionarios", () => {
  it("el español tiene las mismas claves que el portugués", () => {
    const { apiErrors: esErrors, ...esRest } = es;
    const { apiErrors: ptErrors, ...ptRest } = ptBR;
    expect(shape(esRest)).toEqual(shape(ptRest));
    // Los errores que arma el propio panel tienen que estar en los dos idiomas.
    for (const code of Object.keys(ptErrors)) expect(esErrors[code], code).toBeTypeOf("string");
  });

  it("cambiar de idioma cambia los textos", () => {
    setLanguage("es");
    expect(getLanguage()).toBe("es");
    expect(getT().nav.viewMenu).toBe("Ver menú");
    setLanguage("pt-BR");
    expect(getT().nav.viewMenu).toBe("Ver cardápio");
  });
});

describe("panel en español", () => {
  it("menú del empleado", () => {
    setLanguage("es");
    const labels = navFor("staff").map((group) => [group.label ?? "", group.items.map((item) => item.label)]);
    expect(labels).toEqual([
      ["", ["Pedidos", "Nuevo pedido", "Asistente"]],
      ["Menú", ["Productos", "Adicionales"]],
      ["Ventas", ["Reseñas"]],
      ["Local", ["Link y código QR"]],
    ]);
  });

  it("cartel de estado y sus acciones", () => {
    setLanguage("es");
    const opening: Opening = {
      status: "open",
      acceptingOrders: true,
      closesAt: "2026-09-26T02:30:00.000Z",
      nextOpenAt: null,
      pausedUntil: null,
      message: "",
      source: "schedule",
    };
    expect(statusView(opening)).toMatchObject({ label: "Abierto", detail: "hasta las 23:30" });
    const store = { hours: { weekly: { sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] }, exceptions: [] }, override: null };
    const labels = statusActions(store as Pick<OwnerStore, "hours" | "override">, opening).map((action) => action.label);
    expect(labels).toEqual(["Pausar 15 min", "Pausar 30 min", "Pausar 1 hora", "Cerrar ahora"]);
  });

  it("fechas en español y plata siempre en reales", () => {
    setLanguage("es");
    const now = new Date("2026-09-25T15:00:00Z"); // viernes 12:00 en Brasil
    expect(formatWhen("2026-09-25T21:00:00Z", now)).toBe("hoy 18:00");
    expect(formatWhen("2026-09-26T21:00:00Z", now)).toBe("mañana 18:00");
    expect(formatWhen("2026-09-27T21:00:00Z", now)).toBe("dom 18:00");
    expect(formatMoney(7000)).toBe("R$ 70,00");
  });
});

describe("mensajes de error", () => {
  const wrongPassword = new ApiError(401, "INVALID_CREDENTIALS", "E-mail ou senha incorretos");

  it("en español traduce el código", () => {
    expect(errorText(wrongPassword, es)).toBe("E-mail o contraseña incorrectos");
  });

  it("sin traducción, muestra lo que dijo el backend", () => {
    expect(errorText(wrongPassword, ptBR)).toBe("E-mail ou senha incorretos");
    expect(errorText(new ApiError(409, "SLUG_TAKEN", "Esse endereço já está em uso"), es)).toBe("Esse endereço já está em uso");
  });

  it("los errores del propio panel salen del diccionario", () => {
    expect(errorText(new ApiError(0, "NETWORK_ERROR", ""), ptBR)).toBe(ptBR.apiErrors.NETWORK_ERROR);
    expect(errorText(new Error("x"), es)).toBe(es.apiErrors.UNKNOWN);
  });
});
