// Formas de pago del local: cuáles valen para entrega y cuáles para retiro. Funciones puras.

// Para qué vale cada forma de pago: las dos, solo entrega o solo retiro.
export const PAYMENT_FULFILLMENTS = ["both", "delivery", "pickup"];

export const paymentFulfillmentOf = (store, method) => store.paymentOptions?.[method]?.fulfillment ?? "both";

// Las formas de pago que el cliente puede elegir para "delivery" o "pickup".
export const paymentMethodsFor = (store, fulfillment) =>
  store.paymentMethods.filter((method) => [fulfillment, "both"].includes(paymentFulfillmentOf(store, method)));
