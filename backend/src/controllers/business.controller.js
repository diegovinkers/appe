import Commerce from "../models/commerce.model.js";
import Subscription, { planName } from "../models/subscription.model.js";
import Order from "../models/order.model.js";
import { ACTIVE_STATUSES } from "../services/orderStatus.js";
import { notFound, badRequest } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { operatingDayRange, todayIn, TIME_ZONE } from "../lib/dates.js";

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
// alcanza con correr 5 horas antes de tomar la fecha local.
const OPERATING_DAY_OF = { $dateToString: { format: "%Y-%m-%d", date: { $subtract: ["$createdAt", 5 * 60 * 60 * 1000] }, timezone: TIME_ZONE } };
const byKey = (key) => [{ $match: { status: "delivered" } }, { $group: { _id: key, count: { $sum: 1 }, salesCents: { $sum: "$totalCents" } } }, { $sort: { _id: 1 } }];

// Por día de operación (de 05:00 a 05:00): la venta de la madrugada cuenta en la noche anterior.
// Las ventas son los pedidos entregados; los que siguen abiertos se informan aparte para el cierre.
export const getReports = async (req, res) => {
  const { from, to } = req.valid.query;
  const filter = { commerce: req.commerce._id, createdAt: { $gte: operatingDayRange(from).start, $lt: operatingDayRange(to).end } };
  const [totals] = await Order.aggregate([
    { $match: filter },
    { $facet: {
      completed: [{ $match: { status: "delivered" } }, { $group: { _id: null, count: { $sum: 1 }, sales: { $sum: "$totalCents" }, subtotal: { $sum: "$subtotalCents" }, deliveryFees: { $sum: "$deliveryFeeCents" }, discounts: { $sum: { $ifNull: ["$discountCents", 0] } } } }],
      cancelled: [{ $match: { status: "cancelled" } }, { $count: "count" }],
      open: [{ $match: { status: { $in: ACTIVE_STATUSES } } }, { $group: { _id: null, count: { $sum: 1 }, salesCents: { $sum: "$totalCents" } } }],
      payments: byKey("$paymentMethod"),
      fulfillment: byKey("$fulfillment"),
      days: byKey(OPERATING_DAY_OF),
      sources: byKey({ $ifNull: ["$acquisitionSource", "unknown"] }),
      products: [{ $match: { status: "delivered" } }, { $unwind: "$items" }, { $group: { _id: "$items.product", name: { $last: "$items.name" }, quantity: { $sum: "$items.quantity" }, totalCents: { $sum: "$items.totalCents" } } }, { $sort: { quantity: -1, _id: 1 } }, { $limit: 20 }],
    } },
  ]);
  const total = totals?.completed[0];
  const open = totals?.open[0];
  res.json({ from, to, timeZone: TIME_ZONE, completed: total?.count ?? 0, cancelled: totals?.cancelled[0]?.count ?? 0, salesCents: total?.sales ?? 0,
    averageCents: total?.count ? Math.round(total.sales / total.count) : 0,
    subtotalCents: total?.subtotal ?? 0, deliveryFeeCents: total?.deliveryFees ?? 0, discountCents: total?.discounts ?? 0,
    open: { count: open?.count ?? 0, salesCents: open?.salesCents ?? 0 },
    payments: (totals?.payments ?? []).map(({ _id, ...item }) => ({ method: _id, ...item })),
    fulfillment: (totals?.fulfillment ?? []).map(({ _id, ...item }) => ({ type: _id, ...item })),
    days: (totals?.days ?? []).map(({ _id, ...item }) => ({ day: _id, ...item })),
    products: (totals?.products ?? []).map(({ _id, ...item }) => ({ productId: String(_id), ...item })),
    sources: (totals?.sources ?? []).map(({ _id, ...item }) => ({ source: _id, ...item })),
  });
};
