import { describe, expect, it } from "vitest";
import { isValidPixKey } from "../../src/lib/pix.js";
import { paymentMethodsFor } from "../../src/services/payments.service.js";

describe("chave Pix", () => {
  it.each([
    ["CPF con puntos", "529.982.247-25"],
    ["CPF sin puntos", "52998224725"],
    ["CNPJ", "11.222.333/0001-81"],
    ["e-mail", "loja@exemplo.com.br"],
    ["celular con +55", "+55 55 99999-1234"],
    ["celular con DDD", "(55) 99999-1234"],
    ["chave aleatória", "123e4567-e89b-12d3-a456-426614174000"],
  ])("acepta %s", (_case, key) => expect(isValidPixKey(key)).toBe(true));

  it.each([
    ["vacía", ""],
    ["una letra", "x"],
    ["CPF con un dígito mal", "529.982.247-26"],
    ["CNPJ con un dígito mal", "11.222.333/0001-82"],
    ["número corto", "12345"],
    ["e-mail sin dominio", "loja@"],
    ["texto", "minha chave"],
  ])("rechaza %s", (_case, key) => expect(isValidPixKey(key)).toBe(false));
});

describe("formas de pago por entrega o retiro", () => {
  it("sin opciones valen para las dos; con opciones, solo para lo que diga cada una", () => {
    const store = { paymentMethods: ["cash", "pix", "card"] };
    expect(paymentMethodsFor(store, "delivery")).toEqual(["cash", "pix", "card"]);
    const limited = { ...store, paymentOptions: { card: { fulfillment: "pickup" }, cash: { fulfillment: "delivery" } } };
    expect(paymentMethodsFor(limited, "delivery")).toEqual(["cash", "pix"]);
    expect(paymentMethodsFor(limited, "pickup")).toEqual(["pix", "card"]);
  });
});
