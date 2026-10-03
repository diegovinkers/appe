import { describe, expect, it } from "vitest";
import { average, blobToBase64, formatUsd, needsPerson, whatsappPieces } from "./assistant";

describe("formato de WhatsApp", () => {
  it("negrita y links, sin tocar el resto", () => {
    expect(whatsappPieces("*Total: R$ 31,00* no Pix")).toEqual([
      { kind: "bold", text: "Total: R$ 31,00" },
      { kind: "text", text: " no Pix" },
    ]);
    expect(whatsappPieces("Acompanhe: https://app.test/pedido/abc.")).toEqual([
      { kind: "text", text: "Acompanhe: " },
      { kind: "link", text: "https://app.test/pedido/abc" },
      { kind: "text", text: "." },
    ]);
  });

  it("un asterisco suelto queda como texto", () => {
    expect(whatsappPieces("2 * 3 = 6")).toEqual([{ kind: "text", text: "2 * 3 = 6" }]);
    expect(whatsappPieces("")).toEqual([]);
  });
});

describe("costo de la IA", () => {
  it("en dólares, con más decimales cuando no llega a un centavo", () => {
    expect(formatUsd(4200)).toMatch(/US\$\s0,0042/);
    expect(formatUsd(420_000)).toMatch(/US\$\s0,42/);
    expect(formatUsd(0)).toMatch(/US\$\s0,00/);
  });

  it("promedio solo si hay algo que promediar", () => {
    expect(average(10_000, 4)).toBe(2500);
    expect(average(10_000, 0)).toBeNull();
  });
});

it("una conversación espera a una persona si lo último no lo escribió el local", () => {
  expect(needsPerson({ status: "human", lastRole: "assistant" })).toBe(true);
  expect(needsPerson({ status: "human", lastRole: "customer" })).toBe(true);
  expect(needsPerson({ status: "human", lastRole: "staff" })).toBe(false);
  expect(needsPerson({ status: "bot", lastRole: "customer" })).toBe(false);
});

it("un audio en base64, también si es más grande que un bloque", async () => {
  const bytes = new Uint8Array(70_000).map((_, index) => index % 251);
  const encoded = await blobToBase64(new Blob([bytes], { type: "audio/webm" }));
  const decoded = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  expect(decoded).toEqual(bytes);
});
