import { beforeEach, describe, expect, it } from "vitest";
import { getT, setLanguage } from "../../i18n";
import { readCsvFile } from "../../lib/csvFile";
import { newUuid } from "../../lib/id";
import { fromBrazilInput, toBrazilInput } from "../../lib/format";
import { centsToInput, parseMoney } from "../../lib/money";
import { moved } from "./menu/useMenuAdmin";
import { matchesFilter, nextLabel, nextStatus } from "./orders/orderFlow";

beforeEach(() => setLanguage("pt-BR"));

describe("camino de un pedido (igual que el backend)", () => {
  it("entrega: novo → confirmado → pronto → saiu → entregue", () => {
    const steps = [];
    let order = { status: "new" as const, fulfillment: "delivery" as const } as { status: Parameters<typeof nextStatus>[0]["status"]; fulfillment: "delivery" | "pickup" };
    for (let next = nextStatus(order); next; next = nextStatus(order)) {
      steps.push(next);
      order = { ...order, status: next };
    }
    expect(steps).toEqual(["confirmed", "ready", "out_for_delivery", "delivered"]);
  });

  it("retirada: de pronto pasa directo a entregue", () => {
    expect(nextStatus({ status: "ready", fulfillment: "pickup" })).toBe("delivered");
    expect(nextLabel({ status: "ready", fulfillment: "pickup" }, getT())).toBe("Cliente retirou");
    expect(nextLabel({ status: "ready", fulfillment: "delivery" }, getT())).toBe("Saiu para entrega");
  });

  it("entregue y cancelado no siguen", () => {
    expect(nextStatus({ status: "delivered", fulfillment: "delivery" })).toBeNull();
    expect(nextStatus({ status: "cancelled", fulfillment: "pickup" })).toBeNull();
  });

  it("filtros de la lista", () => {
    expect(matchesFilter("out_for_delivery", "active")).toBe(true);
    expect(matchesFilter("cancelled", "active")).toBe(false);
    expect(matchesFilter("cancelled", "done")).toBe(true);
    expect(matchesFilter("confirmed", "new")).toBe(false);
    expect(matchesFilter("delivered", "all")).toBe(true);
  });
});

describe("dinero escrito por una persona", () => {
  it("entiende coma decimal y punto de miles", () => {
    expect(parseMoney("25")).toBe(2500);
    expect(parseMoney("25,90")).toBe(2590);
    expect(parseMoney("25.90")).toBe(2590);
    expect(parseMoney("R$ 1.025,90")).toBe(102590);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });

  it("y lo vuelve a mostrar para editar", () => {
    expect(centsToInput(2590)).toBe("25,90");
    expect(centsToInput(null)).toBe("");
  });
});

describe("ordenar el menú", () => {
  const list = [{ _id: "a" }, { _id: "b" }, { _id: "c" }];
  it("sube y baja una posición", () => {
    expect(moved(list, "b", -1)).toEqual(["b", "a", "c"]);
    expect(moved(list, "b", 1)).toEqual(["a", "c", "b"]);
  });
  it("no se mueve más allá de las puntas", () => {
    expect(moved(list, "a", -1)).toBeNull();
    expect(moved(list, "c", 1)).toBeNull();
  });
});

describe("fechas de la promoción en hora de Brasil", () => {
  it("ida y vuelta con el campo de fecha y hora", () => {
    expect(toBrazilInput("2026-09-27T23:30:00.000Z")).toBe("2026-09-27T20:30");
    expect(fromBrazilInput("2026-09-27T20:30")).toBe("2026-09-27T20:30:00-03:00");
    expect(fromBrazilInput("")).toBeNull();
    expect(toBrazilInput(null)).toBe("");
  });
});

describe("planilla guardada por Excel", () => {
  it("lee UTF-8 y también windows-1252 sin romper los acentos", async () => {
    const texto = "categoria;produto;preco\nPorções;Pão de queijo;8,50\n";
    const utf8 = new File([new TextEncoder().encode(texto)], "menu.csv");
    // "ç", "õ" y "ã" en windows-1252 son un byte cada una.
    const bytes = Uint8Array.from([...texto].map((char) => ({ ç: 0xe7, õ: 0xf5, ã: 0xe3 })[char] ?? char.charCodeAt(0)));
    const excel = new File([bytes], "menu.csv");
    expect(await readCsvFile(utf8)).toBe(texto);
    expect(await readCsvFile(excel)).toBe(texto);
  });
});

describe("referencia de un pago", () => {
  it("es un UUID v4 como pide el backend (z.uuid)", () => {
    const ids = Array.from({ length: 50 }, newUuid);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(new Set(ids).size).toBe(50);
  });
});
