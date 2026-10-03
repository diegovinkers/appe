import { describe, expect, it } from "vitest";
import { moneyToWords, numberToWords, shouldSpeak, speechText } from "../../src/services/assistant/speech.js";

describe("números en palabras", () => {
  it.each([
    [1, "um", "uno"],
    [16, "dezesseis", "dieciséis"],
    [21, "vinte e um", "veintiuno"],
    [100, "cem", "cien"],
    [120, "cento e vinte", "ciento veinte"],
    [999, "novecentos e noventa e nove", "novecientos noventa y nueve"],
    [1200, "mil e duzentos", "mil doscientos"],
    [2345, "dois mil trezentos e quarenta e cinco", "dos mil trescientos cuarenta y cinco"],
    [31000, "trinta e um mil", "treinta y un mil"],
  ])("%i", (n, pt, es) => {
    expect(numberToWords(n)).toBe(pt);
    expect(numberToWords(n, "es")).toBe(es);
  });

  it("plata en reales y centavos", () => {
    expect(moneyToWords(31, 90)).toBe("trinta e um reais e noventa centavos");
    expect(moneyToWords(31, 90, "es")).toBe("treinta y un reales con noventa centavos");
    expect(moneyToWords(1, 0)).toBe("um real");
    expect(moneyToWords(21, 1, "es")).toBe("veintiún reales con un centavo");
  });
});

describe("texto para leer en voz alta", () => {
  it("sin formato, emojis ni links; con precios, pedidos y tiempos en palabras", () => {
    expect(speechText("✅ Seu pedido *#31* foi confirmado! Previsão: 40–60 min.\nAcompanhe: https://app.test/pedido/abc")).toBe(
      "Seu pedido número trinta e um foi confirmado! Previsão: quarenta a sessenta minutos. Acompanhe: o link está na mensagem"
    );
    expect(speechText("¡Listo! Total *R$ 45,00* 🙂", "es")).toBe("¡Listo! Total cuarenta y cinco reales");
  });

  it("se lee solo lo corto: el resumen del pedido va por escrito", () => {
    expect(shouldSpeak("Anotado! Vai ser para entrega ou retirada?")).toBe(true);
    expect(shouldSpeak("*Resumo*\n1x X\n1x Y\nSubtotal\nEntrega\n*Total*\nConfirma?")).toBe(false);
  });
});
