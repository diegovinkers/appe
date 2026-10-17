import { describe, expect, it } from "vitest";
import { hasQuickNote, toggleQuickNote } from "./quickNotes";

describe("notas rápidas", () => {
  it("un toque agrega la nota y otro la saca, sin tocar lo escrito", () => {
    expect(toggleQuickNote("", "Sem cebola")).toBe("Sem cebola");
    expect(toggleQuickNote("Sem cebola", "Bem passado")).toBe("Sem cebola, Bem passado");
    expect(toggleQuickNote("Sem cebola, Bem passado", "sem cebola")).toBe("Bem passado");
    expect(toggleQuickNote("molho à parte", "Sem tomate")).toBe("molho à parte, Sem tomate");
    expect(hasQuickNote("Sem cebola, Bem passado", "bem passado")).toBe(true);
  });

  it("si la nota ya no entra, queda como estaba", () => {
    const long = "x".repeat(135);
    expect(toggleQuickNote(long, "Sem cebola")).toBe(long);
  });
});
