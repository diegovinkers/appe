import Commerce from "../models/commerce.model.js";
import Customer, { MAX_ADDRESSES } from "../models/customer.model.js";
import Order from "../models/order.model.js";

// Lo que ve el cliente de su cuenta. Nunca passwordHash ni tokenVersion.
export const customerView = (customer) => ({
  _id: customer._id,
  name: customer.name,
  phone: customer.phone,
  locale: customer.locale,
  addresses: customer.addresses.map(({ _id, label, street, number, neighborhood, reference }) => ({
    _id,
    label,
    street,
    number,
    neighborhood,
    reference,
  })),
  createdAt: customer.createdAt,
});

const addressKey = (address) =>
  [address.street, address.number, address.neighborhood].map((part) => part.trim().toLocaleLowerCase("pt-BR")).join("|");

// Asocia a la cuenta pedidos hechos desde este aparato: el link de seguimiento prueba
// que los hizo, y además tienen que ser de su mismo teléfono. Nunca solo por teléfono.
// Las direcciones de esos pedidos quedan guardadas: la cuenta nueva ya las tiene.
export async function linkOrders(customer, tokens) {
  if (!tokens.length) return 0;
  const { modifiedCount } = await Order.updateMany(
    { trackingToken: { $in: tokens }, "customer.phone": customer.phone, account: null },
    { $set: { account: customer._id } }
  );
  if (modifiedCount) await adoptAddresses(customer);
  return modifiedCount;
}

async function adoptAddresses(customer) {
  const orders = await Order.find({ account: customer._id, "address.street": { $exists: true } })
    .sort({ createdAt: -1 })
    .limit(MAX_ADDRESSES)
    .select("address")
    .lean();
  const known = new Set(customer.addresses.map(addressKey));
  for (const { address } of orders) {
    const saved = { street: address.street, number: address.number, neighborhood: address.neighborhood, reference: address.reference ?? "" };
    if (known.has(addressKey(saved))) continue;
    known.add(addressKey(saved));
    customer.addresses.push(saved);
  }
  customer.addresses = customer.addresses.slice(0, MAX_ADDRESSES);
  await customer.save();
}

// Después de pedir con la cuenta: la dirección de entrega queda guardada (primera de la
// lista si es nueva o se repite), para no escribirla de nuevo.
export async function rememberOrder(customerId, order) {
  const customer = await Customer.findById(customerId);
  if (!customer) return;
  customer.lastOrderAt = order.createdAt;
  if (order.address) {
    const address = {
      street: order.address.street,
      number: order.address.number,
      neighborhood: order.address.neighborhood,
      reference: order.address.reference ?? "",
    };
    const previous = customer.addresses.find((saved) => addressKey(saved) === addressKey(address));
    const rest = customer.addresses.filter((saved) => saved !== previous);
    customer.addresses = [previous ?? address, ...rest].slice(0, MAX_ADDRESSES);
  }
  await customer.save();
}

// "Meus pedidos": los de la cuenta, en todos los locales, con lo justo de cada local.
export async function customerOrders(customerId) {
  const orders = await Order.find({ account: customerId })
    .sort({ createdAt: -1 })
    .limit(50)
    .select("number status fulfillment totalCents createdAt trackingToken items.quantity commerce")
    .lean();
  const storeIds = [...new Set(orders.map((order) => String(order.commerce)))];
  const stores = await Commerce.find({ _id: { $in: storeIds } }).select("name slug logoUrl primaryColor").lean();
  const byId = new Map(stores.map((store) => [String(store._id), store]));
  return orders.map((order) => {
    const store = byId.get(String(order.commerce));
    return {
      _id: order._id,
      number: order.number,
      status: order.status,
      fulfillment: order.fulfillment,
      totalCents: order.totalCents,
      itemsCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      createdAt: order.createdAt,
      trackingToken: order.trackingToken ?? null,
      store: {
        name: store?.name ?? "",
        slug: store?.slug ?? "",
        logoUrl: store?.logoUrl ?? "",
        primaryColor: store?.primaryColor ?? "#1b2420",
      },
    };
  });
}
