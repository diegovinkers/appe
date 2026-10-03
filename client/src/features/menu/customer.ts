import type { Fulfillment, PaymentMethod } from "../../api/types";

// Los datos del comprador quedan en su propio aparato para no escribirlos cada vez.
export type CustomerDetails = {
  name: string;
  phone: string;
  fulfillment?: Fulfillment;
  zoneId: string;
  neighborhood: string;
  street: string;
  number: string;
  reference: string;
  paymentMethod?: PaymentMethod;
};

const KEY = "cliente";
const EMPTY: CustomerDetails = { name: "", phone: "", zoneId: "", neighborhood: "", street: "", number: "", reference: "" };

export function loadCustomer(): CustomerDetails {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!saved || typeof saved !== "object") return EMPTY;
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    return {
      name: text(saved.name),
      phone: text(saved.phone),
      fulfillment: saved.fulfillment === "delivery" || saved.fulfillment === "pickup" ? saved.fulfillment : undefined,
      zoneId: text(saved.zoneId),
      neighborhood: text(saved.neighborhood),
      street: text(saved.street),
      number: text(saved.number),
      reference: text(saved.reference),
      paymentMethod: ["cash", "pix", "card"].includes(saved.paymentMethod) ? saved.paymentMethod : undefined,
    };
  } catch {
    return EMPTY;
  }
}

export function saveCustomer(details: CustomerDetails) {
  try {
    localStorage.setItem(KEY, JSON.stringify(details));
  } catch {
    // Sin almacenamiento: la próxima vez se vuelven a escribir.
  }
}
