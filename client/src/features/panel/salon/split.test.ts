import { describe, expect, it } from "vitest";
import { parseMoney } from "../../../lib/money";
import { splitEqually } from "./split";

describe("dividir la cuenta", () => {
  it("partes iguales que suman justo el total", () => {
    expect(splitEqually(1000, 3)).toEqual([334, 333, 333]);
    expect(splitEqually(5600, 2)).toEqual([2800, 2800]);
    expect(splitEqually(1, 2)).toEqual([1, 0]);
    expect(splitEqually(98765, 7).reduce((a, b) => a + b, 0)).toBe(98765);
  });

  it("el importe que se muestra se vuelve a leer igual", () => {
    expect(parseMoney("3,34")).toBe(334);
    expect(parseMoney("28,00")).toBe(2800);
  });
});
