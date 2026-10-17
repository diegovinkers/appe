import Commerce from "../models/commerce.model.js";
import Subscription, { planName } from "../models/subscription.model.js";
import Order from "../models/order.model.js";
import Tab from "../models/tab.model.js";
import { ACTIVE_STATUSES } from "../services/orderStatus.js";
import { notFound, badRequest } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { dayStartOf, minutesOf, operatingDayRange, todayIn, TIME_ZONE } from "../lib/dates.js";

function view(subscription) {
  return { subscription: {
    plan: planName(subscription?.plan), priceCents: subscription?.priceCents ?? 7990,
    dueDate: subscription?.dueDate ?? null, status: subscription?.status ?? "trial",
    overdue: !!subscription?.dueDate && subscription.status !== "cancelled" && subscription.dueDate < todayIn(),
    payments: (subscription?.payments ?? []).map(({ reference, amountCents, paidAt, period, note }) => ({ reference, amountCents, paidAt, period, note })),
  } };
}
async function adminCommerce(req) {
  const commerce = await Commerce.findById(req.valid.params.id).select("_id");
  if (!commerce) throw notFound("Estabelecimento não encontrado");
  return commerce._id;
}
export const getAdminSubscription = async (req, res) => res.json(view(await Subscription.findOne({ commerce: await adminCommerce(req) })));
export const getOwnerSubscription = async (req, res) => res.json(view(await Subscription.findOne({ commerce: req.commerce._id })));
export const putSubscription = async (req, res) => {
  const commerce = await adminCommerce(req);
  const subscription = await Subscription.findOneAndUpdate({ commerce }, { $set: req.valid.body }, { upsert: true, returnDocument: "after", runValidators: true });
  await audit(req, { action: "subscription.updated", commerce, entity: { type: "subscription", id: subscription._id }, changes: req.valid.body });
  res.json(view(subscription));
};
export const recordSubscriptionPayment = async (req, res) => {
  const commerce = await adminCommerce(req);
  const payment = req.valid.body;
  if (payment.paidAt > new Date()) throw badRequest("INVALID_PAYMENT_DATE", "O pagamento não pode estar no futuro");
  await Subscription.updateOne({ commerce }, { $setOnInsert: { commerce } }, { upsert: true });
  // Atomic conditional push makes retries idempotent without modifying the due date.
  const result = await Subscription.updateOne({ commerce, "payments.reference": { $ne: payment.reference } }, { $push: { payments: { ...payment, recordedBy: req.user.id } } }, { runValidators: true });
  if (result.modifiedCount) await audit(req, { action: "subscription.payment_recorded", commerce, entity: { type: "commerce", id: commerce }, changes: { amountCents: payment.amountCents, period: payment.period } });
  res.status(result.modifiedCount ? 201 : 200).json(view(await Subscription.findOne({ commerce })));
};
// El día de operación de un pedido, para agrupar: Brasil no tiene horario de verano, así que
// alcanza con correr la hora de corte hacia atrás antes de tomar la fecha local.
const operatingDayOf = (dayStart) => ({
  $dateToString: { format: "%Y-%m-%d", date: { $subtract: ["$createdAt", minutesOf(dayStart) * 60 * 1000] }, timezone: TIME_ZONE },
});
// Por dónde entró: la mesa, el canal (WhatsApp, teléfono, mostrador) o, si pidió por el menú,
// de qué link vino.
const orderSource = {
  $switch: {
    branches: [
      { case: { $eq: ["$fulfillment", "table"] }, then: "table" },
      { case: { $in: ["$channel", ["whatsapp", "phone", "counter"]] }, then: "$channel" },
    ],
    default: { $ifNull: ["$acquisitionSource", "unknown"] },
  },
};
const byKey = (key) => [{ $match: { status: "delivered" } }, { $group: { _id: key, count: { $sum: 1 }, salesCents: { $sum: "$totalCents" } } }, { $sort: { _id: 1 } }];

// Por día de operación (desde la hora de corte del local): la venta de la madrugada cuenta en la noche anterior.
// Las ventas son los pedidos entregados; los que siguen abiertos se informan aparte para el cierre.
export const getReports = async (req, res) => {
  const { from, to } = req.valid.query;
  const dayStart = dayStartOf(req.commerce);
  const filter = { commerce: req.commerce._id, createdAt: { $gte: operatingDayRange(from, dayStart).start, $lt: operatingDayRange(to, dayStart).end } };
  const [totals] = await Order.aggregate([
    { $match: filter },
    { $facet: {
      completed: [{ $match: { status: "delivered" } }, { $group: { _id: null, count: { $sum: 1 }, sales: { $sum: "$totalCents" }, subtotal: { $sum: "$subtotalCents" }, deliveryFees: { $sum: "$deliveryFeeCents" }, discounts: { $sum: { $ifNull: ["$discountCents", 0] } } } }],
      cancelled: [{ $match: { status: "cancelled" } }, { $count: "count" }],
      open: [{ $match: { status: { $in: ACTIVE_STATUSES } } }, { $group: { _id: null, count: { $sum: 1 }, salesCents: { $sum: "$totalCents" } } }],
      // Las mesas se cobran por cuenta (a veces dividida): sus pagos salen de las cuentas, abajo.
      payments: [{ $match: { fulfillment: { $ne: "table" } } }, ...byKey("$paymentMethod")],
      fulfillment: byKey("$fulfillment"),
      days: byKey(operatingDayOf(dayStart)),
      sources: byKey(orderSource),
      products: [{ $match: { status: "delivered" } }, { $unwind: "$items" }, { $group: { _id: "$items.product", name: { $last: "$items.name" }, quantity: { $sum: "$items.quantity" }, totalCents: { $sum: "$items.totalCents" } } }, { $sort: { quantity: -1, _id: 1 } }, { $limit: 20 }],
    } },
  ]);
  // Los pagos de las cuentas de mesa cerradas en el período. Las cerradas antes de que se
  // guardaran los pagos tienen solo la forma de pago: cuentan como un pago por el total.
  const [fees] = await Tab.aggregate([
    { $match: { commerce: req.commerce._id, status: "closed", closedAt: filter.createdAt } },
    { $group: { _id: null, serviceFeeCents: { $sum: { $ifNull: ["$serviceFeeCents", 0] } } } },
  ]);
  const serviceFeeCents = fees?.serviceFeeCents ?? 0;
  const tabPayments = await Tab.aggregate([
    { $match: { commerce: req.commerce._id, status: "closed", closedAt: filter.createdAt } },
    {
      $project: {
        payments: {
          $cond: [
            { $gt: [{ $size: { $ifNull: ["$payments", []] } }, 0] },
            "$payments",
            { $cond: [{ $and: [{ $ne: ["$paymentMethod", null] }, { $gt: ["$totalCents", 0] }] }, [{ paymentMethod: "$paymentMethod", amountCents: "$totalCents" }], []] },
          ],
        },
      },
    },
    { $unwind: "$payments" },
    { $group: { _id: "$payments.paymentMethod", count: { $sum: 1 }, salesCents: { $sum: "$payments.amountCents" } } },
  ]);
  const byMethod = new Map();
  for (const { _id, count, salesCents } of [...(totals?.payments ?? []), ...tabPayments]) {
    const current = byMethod.get(_id) ?? { count: 0, salesCents: 0 };
    byMethod.set(_id, { count: current.count + count, salesCents: current.salesCents + salesCents });
  }
  const payments = [...byMethod].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([method, item]) => ({ method, ...item }));
  const total = totals?.completed[0];
  const open = totals?.open[0];
  res.json({ from, to, timeZone: TIME_ZONE, completed: total?.count ?? 0, cancelled: totals?.cancelled[0]?.count ?? 0, salesCents: (total?.sales ?? 0) + serviceFeeCents,
    averageCents: total?.count ? Math.round(((total.sales ?? 0) + serviceFeeCents) / total.count) : 0,
    serviceFeeCents,
    subtotalCents: total?.subtotal ?? 0, deliveryFeeCents: total?.deliveryFees ?? 0, discountCents: total?.discounts ?? 0,
    open: { count: open?.count ?? 0, salesCents: open?.salesCents ?? 0 },
    payments,
    fulfillment: (totals?.fulfillment ?? []).map(({ _id, ...item }) => ({ type: _id, ...item })),
    days: (totals?.days ?? []).map(({ _id, ...item }) => ({ day: _id, ...item })),
    products: (totals?.products ?? []).map(({ _id, ...item }) => ({ productId: String(_id), ...item })),
    sources: (totals?.sources ?? []).map(({ _id, ...item }) => ({ source: _id, ...item })),
  });
};
