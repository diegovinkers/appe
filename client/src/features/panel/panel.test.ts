import { beforeEach, describe, expect, it } from "vitest";
import type { Opening, Order, OwnerStore } from "../../api/types";
import { initials, readableTextOn } from "../../lib/color";
import { setLanguage } from "../../i18n";
import { formatMinutes, formatWhen, operatingDayISO } from "../../lib/format";
import { byUrgency, matchesFilter, orderSource, orderTiming, takenBy } from "./orders/orderFlow";
import { getDeviceSettings, setDeviceSetting } from "./orders/deviceSettings";
import { bottomBarFor, menuTabsFor, navFor, settingsFor } from "./nav";
import { settingsReadiness } from "./settings/readiness";
import { activeBusy, statusActions, statusView } from "./storeStatus";

// Estos tests miran los textos en portugués; los de español están en i18n.test.ts.
beforeEach(() => setLanguage("pt-BR"));

const labels = (role: Parameters<typeof navFor>[0]) =>
  navFor(role).map((group) => [group.label ?? "", group.items.map((item) => item.label)]);

describe("menú por rol", () => {
  it("el dueño ve lo diario arriba y lo que se configura una vez en Configurações", () => {
    expect(labels("owner")).toEqual([
      ["", ["Início", "Pedidos", "Disponibilidade", "Cardápio", "Assistente"]],
      ["Vendas", ["Relatórios", "Cupons", "Avaliações"]],
      ["", ["Configurações"]],
    ]);
    expect(menuTabsFor("owner").map((tab) => tab.label)).toEqual(["Produtos", "Categorias", "Adicionais", "Planilha"]);
    expect(settingsFor("owner").map((card) => card.label)).toEqual(["Loja", "Link e QR code", "Horários", "Entrega e retirada", "Pagamentos", "Salão", "Equipe", "Assinatura"]);
    expect(bottomBarFor("owner").map((item) => item.label)).toEqual(["Início", "Pedidos", "Novo pedido", "Esgotados"]);
  });

  it("el empleado ve solo lo que necesita para atender", () => {
    expect(labels("staff")).toEqual([["", ["Início", "Pedidos", "Disponibilidade", "Assistente"]]]);
    expect(bottomBarFor("staff").map((item) => item.label)).toEqual(["Início", "Pedidos", "Novo pedido", "Esgotados"]);
    expect(menuTabsFor("staff").map((tab) => tab.label)).toEqual(["Produtos", "Adicionais"]);
    expect(settingsFor("staff").map((card) => card.label)).toEqual(["Link e QR code"]);
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
  ({ hours: { weekly, exceptions: [], dayStart: "05:00" }, override }) as Pick<OwnerStore, "hours" | "override">;
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

describe("tiempos de la lista de pedidos", () => {
  const at = (iso: string) => Date.parse(iso);
  const base = {
    fulfillment: "delivery" as const,
    createdAt: "2026-09-25T22:00:00.000Z",
    scheduledFor: null,
    estimatedMinutes: { min: 40, max: 60 },
    statusHistory: [] as Order["statusHistory"],
  };

  it("un nuevo sin aceptar se marca a los 5 minutos", () => {
    expect(orderTiming({ ...base, status: "new" }, at("2026-09-25T22:04:00Z"))).toMatchObject({ kind: "waiting", minutes: 4, late: false });
    expect(orderTiming({ ...base, status: "new" }, at("2026-09-25T22:07:00Z"))).toMatchObject({ kind: "waiting", minutes: 7, late: true });
  });

  it("el atraso se cuenta desde la confirmación más el tiempo máximo", () => {
    const confirmed = { ...base, status: "confirmed" as const, statusHistory: [{ status: "confirmed" as const, at: "2026-09-25T22:10:00.000Z" }] };
    expect(orderTiming(confirmed, at("2026-09-25T23:05:00Z"))).toMatchObject({ kind: "onTime", minutes: 65, late: false });
    expect(orderTiming(confirmed, at("2026-09-25T23:17:00Z"))).toMatchObject({ kind: "late", minutes: 7, late: true });
    // Recién pasada la hora (30 s) todavía no es "Atrasado 0 min".
    expect(orderTiming(confirmed, at("2026-09-25T23:10:30Z")).late).toBe(false);
  });

  it("un programado vence a su hora y un listo para retirar no es atraso", () => {
    const scheduled = { ...base, status: "confirmed" as const, scheduledFor: "2026-09-26T00:00:00.000Z" };
    expect(orderTiming(scheduled, at("2026-09-25T23:30:00Z")).late).toBe(false);
    expect(orderTiming(scheduled, at("2026-09-26T00:20:00Z"))).toMatchObject({ kind: "late", minutes: 20 });
    const ready = { ...base, fulfillment: "pickup" as const, status: "ready" as const, statusHistory: [{ status: "ready" as const, at: "2026-09-25T22:30:00.000Z" }] };
    expect(orderTiming(ready, at("2026-09-26T01:00:00Z"))).toMatchObject({ kind: "ready", minutes: 150, late: false });
  });

  it("ordena: nuevos (el más viejo arriba) y después por la hora en que tienen que salir", () => {
    const now = at("2026-09-25T23:30:00Z");
    const orders = [
      { ...base, _id: "a", status: "confirmed" as const, createdAt: "2026-09-25T23:00:00.000Z" }, // sale 00:00
      { ...base, _id: "b", status: "new" as const, createdAt: "2026-09-25T23:20:00.000Z" },
      { ...base, _id: "c", status: "confirmed" as const, createdAt: "2026-09-25T22:00:00.000Z" }, // atrasado
      { ...base, _id: "d", status: "new" as const, createdAt: "2026-09-25T23:10:00.000Z" },
    ];
    expect([...orders].sort(byUrgency(now)).map((order) => order._id)).toEqual(["d", "b", "c", "a"]);
  });

  it("el día de operación termina a las 5 de la mañana", () => {
    expect(operatingDayISO(new Date("2026-09-26T04:30:00Z"))).toBe("2026-09-25"); // sábado 01:30
    expect(operatingDayISO(new Date("2026-09-26T08:00:00Z"))).toBe("2026-09-26"); // sábado 05:00
  });

  it("muito movimento vale solo hasta su hora", () => {
    const busy = { extraMinutes: 30, until: "2026-09-26T08:00:00.000Z" };
    expect(activeBusy(busy, Date.parse("2026-09-26T07:59:00Z"))).toEqual(busy);
    expect(activeBusy(busy, Date.parse("2026-09-26T08:00:00Z"))).toBeNull();
    expect(activeBusy(null)).toBeNull();
  });

  it("cada local puede elegir la hora en que termina su día", () => {
    expect(operatingDayISO(new Date("2026-09-26T04:30:00Z"), "00:00")).toBe("2026-09-26"); // sábado 01:30
    expect(operatingDayISO(new Date("2026-09-26T11:00:00Z"), "08:30")).toBe("2026-09-25"); // sábado 08:00
    expect(operatingDayISO(new Date("2026-09-26T11:30:00Z"), "08:30")).toBe("2026-09-26"); // sábado 08:30
  });

  it("muestra los minutos en horas cuando pasan de 60", () => {
    expect([formatMinutes(7), formatMinutes(60), formatMinutes(95)]).toEqual(["7 min", "1 h", "1 h 35 min"]);
  });
});

describe("sonido e impresión del aparato", () => {
  it("el sonido viene prendido y los cambios se ven al instante", () => {
    expect(getDeviceSettings()).toMatchObject({ sound: true, autoPrint: false, paper: 80 });
    setDeviceSetting("autoPrint", true);
    setDeviceSetting("paper", 58);
    expect(getDeviceSettings()).toMatchObject({ sound: true, autoPrint: true, paper: 58 });
  });
});

describe("Configurações: qué falta revisar", () => {
  it("marca Pix sin clave y la entrega por barrio sin barrios", () => {
    const store = {
      name: "Loja", whatsapp: "+5555999990000", address: "Rua 1",
      hours: { weekly: { sun: [], mon: [{ open: "18:00", close: "23:00" }], tue: [], wed: [], thu: [], fri: [], sat: [] }, exceptions: [] },
      fulfillment: { delivery: true, pickup: false }, deliveryMode: "zones", deliveryZones: [],
      paymentMethods: ["cash", "pix"], pixKey: "  ",
    } as unknown as OwnerStore;
    expect(settingsReadiness(store)).toEqual({ storeInfo: true, hours: true, delivery: false, payments: false });
  });
});

describe("de dónde vino cada pedido", () => {
  const base = { channel: "online", conversation: null, fulfillment: "delivery" } as Pick<Order, "channel" | "conversation" | "fulfillment">;

  it("cardápio, asistente, equipo y salón", () => {
    expect(orderSource(base)).toBe("online");
    expect(orderSource({ ...base, channel: "whatsapp", conversation: "c1" })).toBe("assistant");
    expect(orderSource({ ...base, channel: "phone" })).toBe("phone");
    expect(orderSource({ ...base, channel: "counter", fulfillment: "table" })).toBe("table");
  });

  it("quién lo registró, si lo cargó el equipo", () => {
    const at = "2026-10-14T20:00:00Z";
    expect(takenBy({ statusHistory: [{ status: "new", at, byName: "Ana" }, { status: "confirmed", at, byName: "Ana" }] })).toBe("Ana");
    expect(takenBy({ statusHistory: [{ status: "new", at }, { status: "confirmed", at, byName: "Ana" }] })).toBeNull();
  });
});

describe("filtros para dividir la lista", () => {
  const statuses = ["new", "confirmed", "ready", "out_for_delivery", "delivered", "cancelled"] as const;
  const shown = (filter: Parameters<typeof matchesFilter>[1]) => statuses.filter((status) => matchesFilter(status, filter));

  it("Nuevos y En preparación no repiten pedidos y juntos son En curso", () => {
    expect(shown("new")).toEqual(["new"]);
    expect(shown("preparing")).toEqual(["confirmed", "ready", "out_for_delivery"]);
    expect([...shown("new"), ...shown("preparing")]).toEqual(shown("active"));
  });

  it("Listos y en camino; Terminados", () => {
    expect(shown("ready")).toEqual(["ready", "out_for_delivery"]);
    expect(shown("done")).toEqual(["delivered", "cancelled"]);
    expect(shown("all")).toEqual([...statuses]);
  });
});
