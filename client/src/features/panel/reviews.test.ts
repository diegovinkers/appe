import { describe, expect, it } from "vitest";
import { formatRating } from "../../lib/format";
import { reviewRequestLink } from "./orders/OrderDetail";

const order = (changes = {}) => ({
  status: "delivered" as const,
  customer: { name: "Lucía Fernández", phone: "+59899456781" },
  trackingToken: "token-de-seguimiento-123456",
  locale: "pt-BR" as const,
  ...changes,
});
const text = (link: string | null) => decodeURIComponent(link?.split("?text=")[1] ?? "");

describe("pedir reseña por WhatsApp", () => {
  it("abre el WhatsApp del cliente con el link del seguimiento", () => {
    const link = reviewRequestLink(order(), "Burger Demo", "https://pedidos.exemplo/burger-demo");
    expect(link?.startsWith("https://wa.me/59899456781?text=")).toBe(true);
    expect(text(link)).toContain("https://pedidos.exemplo/pedido/token-de-seguimiento-123456");
    expect(text(link)).toContain("Burger Demo");
  });

  it("el mensaje va en el idioma del pedido, no en el del panel", () => {
    expect(text(reviewRequestLink(order(), "X", "http://localhost:5173/x"))).toMatch(/^Olá!/);
    expect(text(reviewRequestLink(order({ locale: "es" }), "X", "http://localhost:5173/x"))).toMatch(/^¡Hola!/);
  });

  it("solo para pedidos entregados, con teléfono y link", () => {
    expect(reviewRequestLink(order({ status: "ready" }), "X", "http://localhost:5173/x")).toBeNull();
    expect(reviewRequestLink(order({ customer: { name: "Seu Antônio", phone: "" } }), "X", "http://localhost:5173/x")).toBeNull();
    expect(reviewRequestLink(order({ trackingToken: undefined }), "X", "http://localhost:5173/x")).toBeNull();
  });
});

describe("nota promedio", () => {
  it("con un decimal y coma", () => {
    expect(formatRating(4.8)).toBe("4,8");
    expect(formatRating(5)).toBe("5,0");
  });
});
