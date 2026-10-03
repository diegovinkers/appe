import Commerce from "../models/commerce.model.js";
import Subscription from "../models/subscription.model.js";
import Order from "../models/order.model.js";
import { notFound, badRequest } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { dayRange, todayIn, TIME_ZONE } from "../lib/dates.js";

function view(subscription) {
  return { subscription: {
    plan: subscription?.plan ?? "Essencial", priceCents: subscription?.priceCents ?? 7990,
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
export const getReports = async (req, res) => {
  const { from, to } = req.valid.query;
  const filter = { commerce: req.commerce._id, createdAt: { $gte: dayRange(from).start, $lt: dayRange(to).end } };
  const [totals] = await Order.aggregate([
    { $match: filter },
    { $facet: {
      completed: [{ $match: { status: "delivered" } }, { $group: { _id: null, count: { $sum: 1 }, sales: { $sum: "$totalCents" } } }],
      cancelled: [{ $match: { status: "cancelled" } }, { $count: "count" }],
      sources: [{ $match: { status: "delivered" } }, { $group: { _id: { $ifNull: ["$acquisitionSource", "unknown"] }, count: { $sum: 1 }, salesCents: { $sum: "$totalCents" } } }],
      products: [{ $match: { status: "delivered" } }, { $unwind: "$items" }, { $group: { _id: "$items.product", name: { $last: "$items.name" }, quantity: { $sum: "$items.quantity" }, totalCents: { $sum: "$items.totalCents" } } }, { $sort: { quantity: -1, _id: 1 } }, { $limit: 20 }],
    } },
  ]);
  const total = totals?.completed[0];
  res.json({ from, to, timeZone: TIME_ZONE, completed: total?.count ?? 0, cancelled: totals?.cancelled[0]?.count ?? 0, salesCents: total?.sales ?? 0,
    averageCents: total?.count ? Math.round(total.sales / total.count) : 0,
    products: (totals?.products ?? []).map(({ _id, ...item }) => ({ productId: String(_id), ...item })),
    sources: (totals?.sources ?? []).map(({ _id, ...item }) => ({ source: _id, ...item })),
  });
};
