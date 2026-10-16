import { describe, expect, it } from "vitest";
import { isConfirmation } from "../../src/services/assistant/confirmation.js";

describe("confirmar el resumen", () => {
  it("reconoce las confirmaciones en portugués, español y portuñol", () => {
    for (const text of ["sim", "Sim!", "Confirmo", "confirmado 👍", "pode mandar", "Sí, por favor", "dale", "ok obrigado", "👍", "Sim, pode mandar.", "listo, de acuerdo", "s"]) {
      expect(isConfirmation(text), text).toBe(true);
    }
  });

  it("con cambios, dudas o un no, no es solo confirmar", () => {
    for (const text of ["não", "no", "sim, mas sem cebola", "sí, agregá papas", "quanto fica?", "ok, e a coca?", "pode tirar o queijo", "", "[image]", "sim sim sim sim sim sim sim"]) {
      expect(isConfirmation(text), text).toBe(false);
    }
  });
});
