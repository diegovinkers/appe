import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "../../src/lib/csv.js";
import { menuToRows, parsePrice, planMenuImport } from "../../src/services/menuImport.service.js";

describe("parseCsv", () => {
  it("lee con punto y coma, comillas, comillas dobles y saltos de línea adentro", () => {
    const text = '﻿categoria;produto;descricao\r\nLanches;X-Burger;"Pão; carne ""artesanal""\ne queijo"\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ["categoria", "produto", "descricao"],
      ["Lanches", "X-Burger", 'Pão; carne "artesanal"\ne queijo'],
    ]);
  });

  it("detecta la coma como separador", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("toCsv y parseCsv van y vuelven", () => {
    const rows = [
      ["categoria", "produto"],
      ["Lanches", 'X "Tudo"; grande'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("parsePrice", () => {
  it.each([
    ["25,90", 2590],
    ["25.90", 2590],
    ["25", 2500],
    ["R$ 1.025,90", 102590],
    ["0,5", 50],
  ])("%s → %i", (text, cents) => {
    expect(parsePrice(text)).toBe(cents);
  });

  it.each(["", "abc", "25,999", "-3"])("rechaza %s", (text) => {
    expect(parsePrice(text)).toBeNull();
  });
});

describe("planMenuImport", () => {
  const menu = {
    categories: [{ _id: "c1", name: "Lanches" }],
    products: [{ _id: "p1", category: "c1", name: "X-Burger" }],
    groups: [{ _id: "g1", name: "Adicionais" }],
  };
  const csv = (text) => parseCsv(text);

  it("actualiza lo que existe, crea lo nuevo y las categorías que faltan", () => {
    const plan = planMenuImport(
      csv(
        "categoria;produto;preco;preco_promocional;disponivel;destaque;grupos;etiquetas\n" +
          "lanches;x-burger;27,00;;sim;sim;adicionais;picante | novo\n" +
          "Lanches;X-Salada;28,50;25,00;não;;;\n" +
          "Bebidas;Coca;6;;;;;"
      ),
      menu
    );
    expect(plan.errors).toEqual([]);
    expect(plan.newCategories).toEqual(["Bebidas"]);
    expect(plan.updates).toEqual([
      {
        productId: "p1",
        fields: {
          name: "x-burger",
          priceCents: 2700,
          promoPriceCents: null,
          available: true,
          featured: true,
          optionGroups: ["g1"],
          tags: ["spicy", "new"],
        },
      },
    ]);
    expect(plan.creates.map((c) => [c.categoryName, c.fields.name, c.fields.priceCents])).toEqual([
      ["Lanches", "X-Salada", 2850],
      ["Bebidas", "Coca", 600],
    ]);
    expect(plan.creates[0].fields).toMatchObject({ promoPriceCents: 2500, available: false, optionGroups: [], tags: [] });
  });

  it("junta todos los errores con su número de línea", () => {
    const plan = planMenuImport(
      csv(
        "categoria;produto;preco;preco_promocional;disponivel;grupos;etiquetas\n" +
          ";Sem categoria;10;;;;\n" +
          "Lanches;Caro;abc;;;;\n" +
          "Lanches;Promo;10;12;;;\n" +
          "Lanches;Talvez;10;;quizás;;\n" +
          "Lanches;Com grupo;10;;;Molhos;\n" +
          "Lanches;Etiqueta;10;;;;doce\n" +
          "Lanches;Repetido;10;;;;\n" +
          "lanches;repetido;11;;;;"
      ),
      menu
    );
    expect(plan.errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6, 7, 9]);
    expect(plan.errors[4].message).toContain("Molhos");
  });

  it("exige las columnas obligatorias", () => {
    const plan = planMenuImport(csv("categoria;nome\nLanches;X"), menu);
    expect(plan.errors).toEqual([{ line: 1, message: "Faltam as colunas: produto, preco" }]);
  });

  it("el export tiene una fila por producto con grupos y etiquetas legibles", () => {
    const rows = menuToRows({
      categories: menu.categories,
      groups: menu.groups,
      products: [
        {
          category: "c1",
          name: "X-Burger",
          description: "Pão e carne",
          priceCents: 2500,
          promoPriceCents: null,
          available: true,
          featured: false,
          optionGroups: ["g1"],
          tags: ["spicy"],
        },
      ],
    });
    expect(rows[1]).toEqual(["Lanches", "X-Burger", "Pão e carne", "25,00", "", "sim", "não", "Adicionais", "picante"]);
  });
});
