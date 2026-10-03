import type { paths } from "../../../api/schema";
import type { OwnerStore } from "../../../api/types";
import { centsToInput } from "../../../lib/money";

type StorePatch = paths["/api/owner/store"]["patch"]["requestBody"]["content"]["application/json"];
type DeliveryStore = Pick<OwnerStore, "fulfillment" | "estimates" | "deliveryMode" | "deliveryFeeCents" | "deliveryZones" | "freeDeliveryFromCents" | "minOrderCents">;

export type ZoneDraft = {
  key: string;
  _id?: string;
  name: string;
  fee: string;
  minimum: string;
  estimateMin: string;
  estimateMax: string;
  active: boolean;
};

export type DeliveryDraft = {
  delivery: boolean;
  pickup: boolean;
  mode: "fixed" | "zones";
  fee: string;
  minimum: string;
  freeEnabled: boolean;
  freeFrom: string;
  deliveryMin: string;
  deliveryMax: string;
  pickupMin: string;
  pickupMax: string;
  zones: ZoneDraft[];
};

export type DeliveryError = "money" | "minutes" | "range" | "fulfillment" | "activeZone" | "zoneName" | "duplicate" | "zoneLimit";
export type DeliveryErrors = Record<string, DeliveryError>;

export function deliveryDraft(store: DeliveryStore): DeliveryDraft {
  return {
    delivery: store.fulfillment.delivery,
    pickup: store.fulfillment.pickup,
    mode: store.deliveryMode,
    fee: centsToInput(store.deliveryFeeCents),
    minimum: centsToInput(store.minOrderCents),
    freeEnabled: store.freeDeliveryFromCents != null,
    freeFrom: centsToInput(store.freeDeliveryFromCents),
    deliveryMin: String(store.estimates.deliveryMin),
    deliveryMax: String(store.estimates.deliveryMax),
    pickupMin: String(store.estimates.pickupMin),
    pickupMax: String(store.estimates.pickupMax),
    zones: store.deliveryZones.map((zone) => ({
      key: zone._id,
      _id: zone._id,
      name: zone.name,
      fee: centsToInput(zone.feeCents),
      minimum: centsToInput(zone.minOrderCents),
      estimateMin: zone.estimateMin == null ? "" : String(zone.estimateMin),
      estimateMax: zone.estimateMax == null ? "" : String(zone.estimateMax),
      active: zone.active,
    })),
  };
}

// Strict decimal input: never turn a negative or malformed fee into another amount.
export function deliveryCents(value: string): number | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= 10_000_000 ? cents : null;
}

export function validateDelivery(draft: DeliveryDraft): { errors: DeliveryErrors; body: StorePatch | null } {
  const errors: DeliveryErrors = {};
  const money = (value: string, key: string, optional = false) => {
    if (optional && !value.trim()) return null;
    const amount = deliveryCents(value);
    if (amount == null) errors[key] = "money";
    return amount;
  };
  const minutes = (value: string, key: string, optional = false) => {
    if (optional && !value.trim()) return null;
    const number = /^\d+$/.test(value.trim()) ? Number(value) : NaN;
    if (!Number.isInteger(number) || number < 0 || number > 600) {
      errors[key] = "minutes";
      return null;
    }
    return number;
  };
  if (!draft.delivery && !draft.pickup) errors.fulfillment = "fulfillment";
  const fee = money(draft.fee, "fee");
  const minimum = money(draft.minimum, "minimum");
  const freeFrom = draft.freeEnabled ? money(draft.freeFrom, "freeFrom") : null;
  const deliveryMin = minutes(draft.deliveryMin, "deliveryMin");
  const deliveryMax = minutes(draft.deliveryMax, "deliveryMax");
  const pickupMin = minutes(draft.pickupMin, "pickupMin");
  const pickupMax = minutes(draft.pickupMax, "pickupMax");
  if (deliveryMin != null && deliveryMax != null && deliveryMin > deliveryMax) errors.deliveryMax = "range";
  if (pickupMin != null && pickupMax != null && pickupMin > pickupMax) errors.pickupMax = "range";
  if (draft.zones.length > 100) errors.zones = "zoneLimit";
  if (draft.delivery && draft.mode === "zones" && !draft.zones.some((zone) => zone.active)) errors.zones = "activeZone";

  const names = new Map<string, string>();
  const zones = draft.zones.map((zone) => {
    const prefix = `zone-${zone.key}`;
    const name = zone.name.trim();
    if (!name || name.length > 60) errors[`${prefix}-name`] = "zoneName";
    const normalized = name.toLocaleLowerCase("pt-BR");
    const duplicate = names.get(normalized);
    if (duplicate) {
      errors[`${prefix}-name`] = "duplicate";
      errors[`${duplicate}-name`] = "duplicate";
    }
    names.set(normalized, prefix);
    const zoneFee = money(zone.fee, `${prefix}-fee`);
    const zoneMinimum = money(zone.minimum, `${prefix}-minimum`, true);
    const estimateMin = minutes(zone.estimateMin, `${prefix}-estimateMin`, true);
    const estimateMax = minutes(zone.estimateMax, `${prefix}-estimateMax`, true);
    const effectiveMin = estimateMin ?? deliveryMin;
    const effectiveMax = estimateMax ?? deliveryMax;
    if (effectiveMin != null && effectiveMax != null && effectiveMin > effectiveMax) errors[`${prefix}-estimateMax`] = "range";
    return {
      ...(zone._id ? { _id: zone._id } : {}),
      name,
      feeCents: zoneFee ?? 0,
      minOrderCents: zoneMinimum,
      estimateMin,
      estimateMax,
      active: zone.active,
    };
  });

  if (Object.keys(errors).length) return { errors, body: null };
  return {
    errors,
    body: {
      fulfillment: { delivery: draft.delivery, pickup: draft.pickup },
      deliveryMode: draft.mode,
      deliveryFeeCents: fee!,
      minOrderCents: minimum!,
      freeDeliveryFromCents: freeFrom,
      estimates: { deliveryMin: deliveryMin!, deliveryMax: deliveryMax!, pickupMin: pickupMin!, pickupMax: pickupMax! },
      deliveryZones: zones,
    },
  };
}
