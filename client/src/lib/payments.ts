import type { PaymentMethod } from "../api/types";

type PaymentStore = {
  paymentMethods: PaymentMethod[];
  paymentOptions?: Partial<Record<PaymentMethod, { fulfillment: "both" | "delivery" | "pickup" }>>;
};

// Las formas de pago que valen para entrega o para retiro (como backend/src/services/payments.service.js).
export const paymentMethodsFor = (store: PaymentStore, fulfillment: "delivery" | "pickup"): PaymentMethod[] =>
  store.paymentMethods.filter((method) => [fulfillment, "both"].includes(store.paymentOptions?.[method]?.fulfillment ?? "both"));
