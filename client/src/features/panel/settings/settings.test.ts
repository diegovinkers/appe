import { describe, expect, it } from "vitest";
import { validateHours, type StoreHours } from "./hoursForm";
import { deliveryCents, validateDelivery, type DeliveryDraft } from "./delivery";

const hours = (): StoreHours => ({ weekly: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }, exceptions: [] });
const delivery = (): DeliveryDraft => ({ delivery: true, pickup: true, mode: "fixed", fee: "5,50", minimum: "0", freeEnabled: false, freeFrom: "", deliveryMin: "30", deliveryMax: "60", pickupMin: "10", pickupMax: "20", zones: [] });

describe("configuración de horarios", () => {
  it("permite turnos nocturnos y 24:00, rechaza solapamientos", () => {
    const d = hours(); d.weekly.mon = [{ open: "18:00", close: "02:00" }]; d.weekly.tue = [{ open: "00:00", close: "24:00" }];
    expect(validateHours(d)).toEqual({});
    d.weekly.mon.push({ open: "19:00", close: "23:00" });
    expect(Object.values(validateHours(d))).toContain("overlap");
  });
  it("rechaza fechas repetidas, imposibles y apertura sin turnos", () => {
    const d = hours(); d.exceptions = [{ date: "2030-02-30", closed: true, note: "", intervals: [] }];
    expect(Object.values(validateHours(d, "2030-01-01"))).toContain("invalidDate");
    d.exceptions = [0, 1].map(() => ({ date: "2030-05-01", closed: false, note: "", intervals: [] }));
    expect(Object.values(validateHours(d, "2030-01-01"))).toContain("duplicateDate");
    expect(Object.values(validateHours(d, "2030-01-01"))).toContain("emptyIntervals");
  });
});

describe("configuración de entrega", () => {
  it("mantiene centavos exactos y rechaza importes ambiguos", () => {
    expect(deliveryCents("12,50")).toBe(1250);
    for (const value of ["-1", "1e2", "1.234", "abc", ""]) expect(deliveryCents(value)).toBeNull();
    expect(validateDelivery(delivery()).body?.deliveryFeeCents).toBe(550);
  });
  it("exige un canal y zonas activas, valida plazos heredados", () => {
    const d = delivery(); d.delivery = false; d.pickup = false;
    expect(validateDelivery(d).errors.fulfillment).toBe("fulfillment");
    d.delivery = true; d.mode = "zones";
    expect(validateDelivery(d).errors.zones).toBe("activeZone");
    d.zones = [{ key: "a", _id: "abc", name: "Centro", active: true, fee: "0", minimum: "", estimateMin: "80", estimateMax: "" }];
    expect(validateDelivery(d).errors["zone-a-estimateMax"]).toBe("range");
    d.zones[0].estimateMin = "";
    expect(validateDelivery(d).body?.deliveryZones?.[0]).toMatchObject({ _id: "abc", minOrderCents: null });
  });
});
