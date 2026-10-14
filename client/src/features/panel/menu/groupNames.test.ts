import { describe, expect, it } from "vitest";
import { duplicateSets, groupKey, similarGroups } from "./groupNames";

const groups = [{ name: "Ponto da carne" }, { name: "Adicionais" }, { name: "Molhos" }, { name: "Sabor do refri" }];
const names = (list: { name: string }[]) => list.map((group) => group.name);

describe("nombres de grupos de opciones", () => {
  it("ignora mayúsculas, acentos, espacios y signos", () => {
    expect(groupKey("  Ponto-da  Carne ")).toBe("ponto da carne");
    expect(groupKey("Pão")).toBe("pao");
  });

  it("avisa de un nombre igual, contenido o con una letra de diferencia", () => {
    expect(names(similarGroups("ponto da carne", groups))).toEqual(["Ponto da carne"]);
    expect(names(similarGroups("Ponto", groups))).toEqual(["Ponto da carne"]);
    expect(names(similarGroups("Adicional", groups))).toEqual(["Adicionais"]);
    expect(names(similarGroups("Molho", groups))).toEqual(["Molhos"]);
  });

  it("no avisa con nombres distintos ni muy cortos", () => {
    expect(similarGroups("Bebidas", groups)).toEqual([]);
    expect(similarGroups("Mo", groups)).toEqual([]);
    expect(similarGroups("Tamanho", groups)).toEqual([]);
  });

  it("encuentra los repetidos para juntar", () => {
    const list = [...groups, { name: "ponto da carne " }, { name: "PONTO DA CARNE" }, { name: "Adicional" }];
    expect(duplicateSets(list).map(names)).toEqual([["Ponto da carne", "ponto da carne ", "PONTO DA CARNE"]]);
  });
});
