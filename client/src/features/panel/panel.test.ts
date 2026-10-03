import { beforeEach, describe, expect, it } from "vitest";
import type { Opening, OwnerStore } from "../../api/types";
import { initials, readableTextOn } from "../../lib/color";
import { setLanguage } from "../../i18n";
import { formatWhen } from "../../lib/format";
import { navFor } from "./nav";
import { statusActions, statusView } from "./storeStatus";

// Estos tests miran los textos en portugués; los de español están en i18n.test.ts.
beforeEach(() => setLanguage("pt-BR"));

const labels = (role: Parameters<typeof navFor>[0]) =>
  navFor(role).map((group) => [group.label ?? "", group.items.map((item) => item.label)]);

describe("menú por rol", () => {
  it("el dueño ve todas las secciones", () => {
    expect(labels("owner")).toEqual([
      ["", ["Pedidos", "Novo pedido", "Assistente", "Preparar loja", "Relatórios"]],
      ["Cardápio", ["Produtos", "Categorias", "Adicionais", "Planilha"]],
      ["Vendas", ["Cupons", "Avaliações"]],
      ["Loja", ["Dados da loja", "Horários", "Entrega e pagamento", "Link e QR code", "Minha assinatura"]],
    ]);
  });

  it("el empleado ve solo lo que puede usar", () => {
    expect(labels("staff")).toEqual([
      ["", ["Pedidos", "Novo pedido", "Assistente"]],
      ["Cardápio", ["Produtos", "Adicionais"]],
      ["Vendas", ["Avaliações"]],
      ["Loja", ["Link e QR code"]],
    ]);
  });

  it("el superadmin no tiene menú de loja", () => {
    expect(navFor("superadmin")).toEqual([]);
  });
});

const opening = (changes: Partial<Opening>): Opening => ({
  status: "open",
  acceptingOrders: true,
  closesAt: null,
  nextOpenAt: null,
  pausedUntil: null,
  message: "",
  source: "schedule",
  ...changes,
});
const empty = { sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] };
const withSchedule = { ...empty, fri: [{ open: "18:00", close: "23:30" }] };
const store = (weekly: OwnerStore["hours"]["weekly"], override: OwnerStore["override"] = null) =>
  ({ hours: { weekly, exceptions: [] }, override }) as Pick<OwnerStore, "hours" | "override">;
const keys = (actions: ReturnType<typeof statusActions>) => actions.map((action) => action.key);

describe("cartel de estado", () => {
  it("abierto: pausar o cerrar", () => {
    expect(keys(statusActions(store(withSchedule), opening({})))).toEqual(["pause-15", "pause-30", "pause-60", "close"]);
  });

  it("abierto a mano con horario cargado: también volver al horario", () => {
    const manual = store(withSchedule, { mode: "open", until: null, message: "" });
    expect(keys(statusActions(manual, opening({ source: "override" })))).toContain("auto");
  });

  it("pausado: retomar vuelve al horario si hay, o abre a mano si no", () => {
    const paused = opening({ status: "paused", acceptingOrders: false });
    expect(statusActions(store(withSchedule), paused)[0].change).toEqual({ mode: "auto" });
    expect(statusActions(store(empty), paused)[0].change).toEqual({ mode: "open" });
  });

  it("cerrado: abrir", () => {
    expect(keys(statusActions(store(empty), opening({ status: "closed", acceptingOrders: false })))).toEqual(["open"]);
  });

  it("muestra hasta cuándo, en hora de Brasil", () => {
    const view = statusView(opening({ closesAt: "2026-09-26T02:30:00.000Z" }));
    expect(view).toMatchObject({ label: "Aberto", detail: "até 23:30", tone: "bg-open" });
    const closed = statusView(
      opening({ status: "closed", acceptingOrders: false, nextOpenAt: "2026-09-26T21:00:00.000Z" }),
      new Date("2026-09-25T18:00:00Z")
    );
    expect(closed.detail).toBe("abre amanhã 18:00");
  });
});

describe("utilidades", () => {
  it("elige texto legible sobre el color del local", () => {
    expect(readableTextOn("#D9480F")).toBe("#ffffff");
    expect(readableTextOn("#F8E71C")).toBe("#1b2420");
    expect(readableTextOn("rojo")).toBe("#ffffff");
  });

  it("iniciales del local", () => {
    expect(initials("Burger Demo")).toBe("BD");
    expect(initials("lanches")).toBe("LA");
  });

  it("fechas relativas en hora de Brasil", () => {
    const now = new Date("2026-09-25T15:00:00Z"); // viernes 12:00
    expect(formatWhen("2026-09-25T21:00:00Z", now)).toBe("hoje 18:00");
    expect(formatWhen("2026-09-26T02:30:00Z", now)).toBe("hoje 23:30");
    expect(formatWhen("2026-09-26T21:00:00Z", now)).toBe("amanhã 18:00");
    expect(formatWhen("2026-09-27T21:00:00Z", now)).toBe("dom 18:00");
  });
});
