// Crear un pedido de punta a punta: carga de la base lo que hace falta, calcula con
// priceOrder y lo guarda en una transacción. Lo usan el menú, el panel y el asistente.
//
// `origin` dice quién lo hace, no por dónde llegó:
// - "customer": el cliente (menú o asistente de WhatsApp). Respeta el horario del local,
//   el mínimo y las franjas de programados, y entra como "new".
// - "panel": lo carga el local. No exige local abierto ni mínimo y entra confirmado.
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import Category from "../models/category.model.js";
import Commerce from "../models/commerce.model.js";
import Coupon from "../models/coupon.model.js";
import OptionGroup from "../models/optionGroup.model.js";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import { badRequest, conflict } from "../lib/errors.js";
import { getOpeningStatus } from "./opening.service.js";
import { priceOrder } from "./order.service.js";
import { checkScheduledTime } from "./scheduling.service.js";

// Hasta cuántos días para adelante se puede cargar a mano un pedido programado.
const MANUAL_SCHEDULE_DAYS = 30;

async function priceFor({ store, input, origin, now }) {
  const manual = origin === "panel";

  if (input.scheduledFor) {
    if (!manual) checkScheduledTime(store, input.scheduledFor, now);
    else if (input.scheduledFor <= now || input.scheduledFor - now > MANUAL_SCHEDULE_DAYS * 24 * 60 * 60 * 1000) {
      throw badRequest("INVALID_SCHEDULE_TIME", `Escolha um horário futuro, de até ${MANUAL_SCHEDULE_DAYS} dias`);
    }
  }
  // Un pedido programado se evalúa para su horario: apertura y horario de las categorías.
  const serviceAt = input.scheduledFor ?? now;

  const products = await Product.find({
    commerce: store._id,
    _id: { $in: [...new Set(input.items.map((item) => item.productId))] },
  }).lean();
  const [categories, groups] = await Promise.all([
    Category.find({ commerce: store._id, _id: { $in: products.map((p) => p.category) }, active: true })
      .select("name schedule")
      .lean(),
    OptionGroup.find({ commerce: store._id, _id: { $in: products.flatMap((p) => p.optionGroups) } }).lean(),
  ]);

  let coupon = null;
  let customerUses = 0;
  if (input.couponCode) {
    coupon = await Coupon.findOne({ commerce: store._id, code: input.couponCode }).lean();
    if (coupon && input.customer.phone) {
      customerUses = await Order.countDocuments({
        commerce: store._id,
        "coupon.code": coupon.code,
        "customer.phone": input.customer.phone,
        status: { $ne: "cancelled" },
      });
    }
  }

  return priceOrder({
    input,
    store,
    opening: getOpeningStatus(store, serviceAt),
    products,
    categories,
    groups,
    coupon,
    customerUses,
    manual,
    now,
    serviceAt,
  });
}

// Lo que costaría el pedido, sin guardar nada (el asistente lo muestra antes de confirmar).
// Tira los mismos errores que placeOrder.
export async function quoteOrder({ store, input, origin = "customer", now = new Date() }) {
  const { zone, stock, ...priced } = await priceFor({ store, input, origin, now });
  return { ...priced, zone };
}

/**
 * @param {object} args
 * @param {object} args.store       El local (documento de Commerce).
 * @param {object} args.input       Pedido validado (createOrderSchema o manualOrderSchema).
 * @param {string} args.channel     online | phone | whatsapp | counter
 * @param {"customer"|"panel"} args.origin
 * @param {{ id: string }} [args.user]  Usuario del panel (obligatorio con origin "panel").
 * @param {string|null} [args.account]  Cuenta del cliente que lo hace.
 * @param {string|null} [args.conversation]  Conversación del asistente que lo tomó.
 */
export async function placeOrder({ store, input, channel, origin, user = null, account = null, conversation = null }) {
  if (!["customer", "panel"].includes(origin)) throw new Error(`origin inválido: ${origin}`);
  const now = new Date();
  const manual = origin === "panel";
  const { zone, stock, ...priced } = await priceFor({ store, input, origin, now });

  // Los cargados en el panel entran confirmados: el local ya los aceptó.
  const history = [{ status: "new", at: now }];
  if (manual) history.push({ status: "confirmed", at: now, by: user.id });

  // En una transacción: si algo falla (se acabó el stock o el cupón en el medio), el
  // stock, el cupón y el contador vuelven atrás y no quedan números salteados.
  let order;
  await mongoose.connection.transaction(async (session) => {
    for (const { product, quantity } of stock) {
      const { modifiedCount } = await Product.updateOne(
        { _id: product, commerce: store._id, trackStock: true, stock: { $gte: quantity } },
        { $inc: { stock: -quantity } },
        { session }
      );
      if (!modifiedCount) {
        throw conflict("OUT_OF_STOCK", "Um produto do pedido acabou de esgotar", { productId: String(product) });
      }
    }

    if (priced.coupon) {
      const { modifiedCount } = await Coupon.updateOne(
        {
          commerce: store._id,
          code: priced.coupon.code,
          active: true,
          $or: [{ maxUses: null }, { $expr: { $lt: ["$uses", "$maxUses"] } }],
        },
        { $inc: { uses: 1 } },
        { session }
      );
      if (!modifiedCount) throw badRequest("COUPON_EXHAUSTED", "Esse cupom já esgotou");
    }

    const { orderCounter: number } = await Commerce.findByIdAndUpdate(
      store._id,
      { $inc: { orderCounter: 1 } },
      { returnDocument: "after", session }
    ).select("+orderCounter");

    [order] = await Order.create(
      [
        {
          commerce: store._id,
          clientOrderId: input.clientOrderId,
          trackingToken: randomBytes(24).toString("base64url"),
          channel,
          acquisitionSource: manual ? "unknown" : (input.acquisitionSource ?? "direct"),
          account,
          conversation,
          locale: input.locale,
          number,
          customer: { name: input.customer.name, phone: input.customer.phone ?? "" },
          fulfillment: input.fulfillment,
          // En entrega por barrio, el nombre del barrio sale de la lista del local.
          address: zone
            ? { ...input.address, neighborhood: zone.name, zoneId: zone._id }
            : input.address && { ...input.address, zoneId: undefined },
          paymentMethod: input.paymentMethod,
          notes: input.notes ?? "",
          scheduledFor: input.scheduledFor ?? null,
          ...priced,
          status: manual ? "confirmed" : "new",
          statusHistory: history,
        },
      ],
      { session }
    );
  });
  return order;
}
