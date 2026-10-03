// Estados del pedido:
//   delivery: new → confirmed → ready → out_for_delivery → delivered
//   retiro:   new → confirmed → ready → delivered
// y cancelled desde cualquier estado que no sea final (con motivo).
export const ORDER_STATUSES = ["new", "confirmed", "ready", "out_for_delivery", "delivered", "cancelled"];

export const STATUS_LABELS = {
  new: "novo",
  confirmed: "confirmado",
  ready: "pronto",
  out_for_delivery: "saiu para entrega",
  delivered: "entregue",
  cancelled: "cancelado",
};

const NEXT = {
  delivery: {
    new: ["confirmed", "cancelled"],
    confirmed: ["ready", "cancelled"],
    ready: ["out_for_delivery", "cancelled"],
    out_for_delivery: ["delivered", "cancelled"],
  },
  pickup: {
    new: ["confirmed", "cancelled"],
    confirmed: ["ready", "cancelled"],
    ready: ["delivered", "cancelled"],
  },
};

export const canTransition = (from, to, fulfillment = "delivery") => NEXT[fulfillment]?.[from]?.includes(to) ?? false;
