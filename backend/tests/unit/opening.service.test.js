import { describe, expect, it } from "vitest";
import { getOpeningStatus } from "../../src/services/opening.service.js";

// 2026-09-25 es viernes. Brasil = UTC-3 (sin horario de verano).
const at = (iso) => new Date(iso);
const iso = (date) => date?.toISOString() ?? null;

const weekly = {
  sun: [],
  mon: [],
  tue: [{ open: "18:00", close: "23:30" }],
  wed: [{ open: "18:00", close: "23:30" }],
  thu: [{ open: "18:00", close: "23:30" }],
  fri: [
    { open: "11:00", close: "14:30" },
    { open: "18:00", close: "02:00" },
  ],
  sat: [{ open: "18:00", close: "02:00" }],
};
const hours = { weekly, exceptions: [] };

describe("getOpeningStatus", () => {
  it("abierto dentro de un turno, con la hora de cierre", () => {
    const status = getOpeningStatus({ hours }, at("2026-09-25T15:00:00Z")); // vie 12:00
    expect(status).toMatchObject({ status: "open", acceptingOrders: true, source: "schedule" });
    expect(iso(status.closesAt)).toBe("2026-09-25T17:30:00.000Z"); // 14:30
  });

  it("cerrado entre turnos, con la próxima apertura", () => {
    const status = getOpeningStatus({ hours }, at("2026-09-25T18:00:00Z")); // vie 15:00
    expect(status).toMatchObject({ status: "closed", acceptingOrders: false });
    expect(iso(status.nextOpenAt)).toBe("2026-09-25T21:00:00.000Z"); // 18:00
  });

  it("un turno que cruza la medianoche sigue abierto el día siguiente", () => {
    const status = getOpeningStatus({ hours }, at("2026-09-26T04:00:00Z")); // sáb 01:00, turno del viernes
    expect(status.status).toBe("open");
    expect(iso(status.closesAt)).toBe("2026-09-26T05:00:00.000Z"); // sáb 02:00
  });

  it("busca la próxima apertura en los días siguientes", () => {
    const status = getOpeningStatus({ hours }, at("2026-09-28T15:00:00Z")); // lun 12:00 (lunes cerrado)
    expect(iso(status.nextOpenAt)).toBe("2026-09-29T21:00:00.000Z"); // mar 18:00
  });

  it("une turnos que se tocan: 18:00–24:00 y 00:00–03:00 del día siguiente", () => {
    const joined = {
      weekly: { ...weekly, tue: [{ open: "18:00", close: "24:00" }], wed: [{ open: "00:00", close: "03:00" }] },
      exceptions: [],
    };
    const status = getOpeningStatus({ hours: joined }, at("2026-09-30T02:00:00Z")); // mar 23:00
    expect(iso(status.closesAt)).toBe("2026-09-30T06:00:00.000Z"); // mié 03:00
  });

  it("una excepción cierra un día que normalmente abre", () => {
    const holiday = { weekly, exceptions: [{ date: "2026-09-25", closed: true, intervals: [] }] };
    const status = getOpeningStatus({ hours: holiday }, at("2026-09-25T15:00:00Z"));
    expect(status.status).toBe("closed");
    expect(iso(status.nextOpenAt)).toBe("2026-09-26T21:00:00.000Z"); // sáb 18:00
  });

  it("una excepción cambia el horario de un día", () => {
    const special = { weekly, exceptions: [{ date: "2026-09-28", closed: false, intervals: [{ open: "10:00", close: "12:00" }] }] };
    expect(getOpeningStatus({ hours: special }, at("2026-09-28T14:00:00Z")).status).toBe("open"); // lun 11:00
  });

  it("sin horarios cargados está cerrado y sin próxima apertura", () => {
    const status = getOpeningStatus({ hours: { weekly: {}, exceptions: [] } }, at("2026-09-25T15:00:00Z"));
    expect(status).toMatchObject({ status: "closed", nextOpenAt: null });
  });

  describe("override manual", () => {
    const now = at("2026-09-25T18:00:00Z"); // vie 15:00, cerrado por horario

    it("abrir sin vencimiento deja abierto aunque el horario diga cerrado", () => {
      const status = getOpeningStatus({ hours, override: { mode: "open", until: null } }, now);
      expect(status).toMatchObject({ status: "open", acceptingOrders: true, closesAt: null, source: "override" });
    });

    it("cerrar hasta una hora: después vuelve el horario", () => {
      const override = { mode: "closed", until: at("2026-09-25T22:00:00Z") }; // hasta las 19:00
      const during = getOpeningStatus({ hours, override }, at("2026-09-25T21:30:00Z")); // 18:30, turno abierto
      expect(during.status).toBe("closed");
      expect(iso(during.nextOpenAt)).toBe("2026-09-25T22:00:00.000Z"); // reabre a las 19:00 (sigue en turno)
      expect(getOpeningStatus({ hours, override }, at("2026-09-25T22:30:00Z")).status).toBe("open");
    });

    it("pausar: abierto pero sin aceptar pedidos, con aviso", () => {
      const override = { mode: "paused", until: at("2026-09-25T22:20:00Z"), message: "Muitos pedidos" };
      const status = getOpeningStatus({ hours, override }, at("2026-09-25T22:00:00Z"));
      expect(status).toMatchObject({ status: "paused", acceptingOrders: false, message: "Muitos pedidos" });
      expect(iso(status.pausedUntil)).toBe("2026-09-25T22:20:00.000Z");
    });

    it("un override vencido se ignora", () => {
      const override = { mode: "closed", until: at("2026-09-25T20:00:00Z") };
      expect(getOpeningStatus({ hours, override }, at("2026-09-25T21:30:00Z")).status).toBe("open");
    });
  });
});
