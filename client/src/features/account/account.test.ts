import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatPhone } from "../../lib/phone";
import { addressLine, deviceOrderTokens, rememberDeviceOrder, safeReturn } from "./account";

// Las pruebas corren sin navegador: un localStorage en memoria.
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
});

const token = (n: number) => `token-de-seguimento-${String(n).padStart(4, "0")}`;

describe("pedidos de este aparato", () => {
  it("guarda el link de cada pedido, el último primero y sin repetir", () => {
    rememberDeviceOrder(token(1));
    rememberDeviceOrder(token(2));
    rememberDeviceOrder(token(1));
    expect(deviceOrderTokens()).toEqual([token(1), token(2)]);
  });

  it("se queda con los últimos 20 (lo máximo que acepta el servidor)", () => {
    for (let n = 1; n <= 25; n++) rememberDeviceOrder(token(n));
    const saved = deviceOrderTokens();
    expect(saved).toHaveLength(20);
    expect(saved[0]).toBe(token(25));
  });

  it("ignora lo que no es un link de pedido", () => {
    rememberDeviceOrder("corto");
    localStorage.setItem("pedidos.deste-aparelho", JSON.stringify([token(1), 42, "<script>", null]));
    expect(deviceOrderTokens()).toEqual([token(1)]);
    localStorage.setItem("pedidos.deste-aparelho", "{roto");
    expect(deviceOrderTokens()).toEqual([]);
  });
});

describe("volver después de entrar", () => {
  it("solo a rutas de la propia app", () => {
    expect(safeReturn("/burger-demo")).toBe("/burger-demo");
    expect(safeReturn("/pedido/abc?x=1")).toBe("/pedido/abc?x=1");
    expect(safeReturn("//otro-sitio.com")).toBe("/");
    expect(safeReturn("https://otro-sitio.com")).toBe("/");
    expect(safeReturn("/\\otro-sitio.com")).toBe("/");
    expect(safeReturn("/\t/otro-sitio.com")).toBe("/");
    expect(safeReturn(null)).toBe("/");
  });
});

it("una dirección en una línea", () => {
  expect(addressLine({ street: "Rua Uruguai", number: "640", neighborhood: "Centro" })).toBe("Rua Uruguai, 640 — Centro");
});

it("el WhatsApp de la cuenta, como se lee", () => {
  expect(formatPhone("+5555999991234")).toBe("+55 55 99999-1234");
  expect(formatPhone("+59899123456")).toBe("+598 99 123 456");
  expect(formatPhone("(55) 99999-1234")).toBe("(55) 99999-1234");
});
