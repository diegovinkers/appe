import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import Order from "../models/order.model.js";
import Tab from "../models/tab.model.js";
import Table from "../models/table.model.js";
import { audit, diffFields } from "../lib/audit.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { placeOrder } from "../services/orderPlacement.service.js";
import { freeCell, tabAmounts, tableState } from "../services/tables.service.js";
import { buildBill, buildTicketHtml } from "../services/ticket.service.js";

const tableNotFound = () => notFound("Mesa não encontrada");
const tabNotFound = () => notFound("Conta não encontrada");
const OPEN = ["open", "bill_requested"];
// Los pedidos de la cuenta que todavía están en cocina o esperando servirse.
const IN_PROGRESS = ["new", "confirmed", "ready"];

const tableView = ({ _id, number, name, seats, x, y, active }) => ({ _id, number, name, seats, x, y, active });
const tabView = (tab, orders, store) => ({
  _id: tab._id,
  table: tab.table,
  tableNumber: tab.tableNumber,
  status: tab.status,
  openedAt: tab.createdAt,
  billRequestedAt: tab.billRequestedAt,
  closedAt: tab.closedAt,
  paymentMethod: tab.paymentMethod,
  changeForCents: tab.changeForCents,
  payments: (tab.payments ?? []).map(({ paymentMethod, amountCents, changeForCents }) => ({ paymentMethod, amountCents, changeForCents: changeForCents ?? null })),
  ...tabAmounts(tab, orders, store),
  serviceFeeWaived: tab.serviceFeeWaived ?? false,
  ordersCount: orders.filter((order) => order.status !== "cancelled").length,
});

async function findTable(req, id = req.valid.params.id) {
  const table = await Table.findOne({ _id: id, commerce: req.commerce._id });
  if (!table) throw tableNotFound();
  return table;
}

async function findOpenTab(req, id = req.valid.params.id) {
  const tab = await Tab.findOne({ _id: id, commerce: req.commerce._id });
  if (!tab) throw tabNotFound();
  if (!OPEN.includes(tab.status)) throw conflict("TAB_CLOSED", "Esta conta já foi fechada");
  return tab;
}

const ordersOf = (req, tabId, session) => Order.find({ commerce: req.commerce._id, tab: tabId }).sort({ createdAt: 1 }).session(session ?? null);

// La posición tiene que estar libre (dos mesas no pueden ocupar la misma celda).
async function checkCell(req, { x, y }, exceptId) {
  const taken = await Table.exists({ commerce: req.commerce._id, active: true, x, y, ...(exceptId && { _id: { $ne: exceptId } }) });
  if (taken) throw conflict("TABLE_POSITION_TAKEN", "Já existe uma mesa nesse lugar");
}

const duplicateNumber = (error) => error.code === 11000 && error.keyPattern?.number;
const numberTaken = () => conflict("TABLE_NUMBER_TAKEN", "Já existe uma mesa com esse número");

// --- El salón ---

// Las mesas con su estado y un resumen de la cuenta abierta (para el plano del salón).
export const listTables = async (req, res) => {
  const tables = await Table.find({ commerce: req.commerce._id }).sort({ number: 1 }).lean();
  const tabs = await Tab.find({ commerce: req.commerce._id, status: { $in: OPEN } }).lean();
  const orders = tabs.length
    ? await Order.find({ commerce: req.commerce._id, tab: { $in: tabs.map((tab) => tab._id) } }).select("tab status totalCents items.name items.quantity createdAt").sort({ createdAt: 1 }).lean()
    : [];
  const byTab = new Map(tabs.map((tab) => [String(tab._id), []]));
  for (const order of orders) byTab.get(String(order.tab))?.push(order);
  const tabByTable = new Map(tabs.map((tab) => [String(tab.table), tab]));

  res.json({
    tables: tables.map((table) => {
      const tab = tabByTable.get(String(table._id)) ?? null;
      const tabOrders = tab ? byTab.get(String(tab._id)) : [];
      const live = tabOrders.filter((order) => order.status !== "cancelled");
      return {
        ...tableView(table),
        state: tableState(tab, tabOrders),
        tab: tab && {
          ...tabView(tab, tabOrders, req.commerce),
          // Lo último que pidió la mesa, para verlo sin abrirla.
          lastItems: live.flatMap((order) => order.items.map(({ name, quantity }) => ({ name, quantity }))).slice(-4),
        },
      };
    }),
  });
};

export const createTable = async (req, res) => {
  const body = req.valid.body;
  const existing = await Table.find({ commerce: req.commerce._id }).select("number x y active").lean();
  const number = body.number ?? Math.max(0, ...existing.map((table) => table.number)) + 1;
  const place = body.x != null && body.y != null ? { x: body.x, y: body.y } : freeCell(existing.filter((table) => table.active));
  if (!place) throw conflict("TABLE_POSITION_TAKEN", "Não há lugar livre no salão");
  await checkCell(req, place);
  let table;
  try {
    table = await Table.create({ commerce: req.commerce._id, number, name: body.name, seats: body.seats, ...place });
  } catch (error) {
    if (duplicateNumber(error)) throw numberTaken();
    throw error;
  }
  await audit(req, { action: "table.created", entity: { type: "table", id: table._id }, changes: { number, name: body.name } });
  res.status(201).json({ table: tableView(table) });
};

export const updateTable = async (req, res) => {
  const table = await findTable(req);
  const changes = req.valid.body;
  const before = table.toObject();
  if (changes.active === false && (await Tab.exists({ commerce: req.commerce._id, table: table._id, status: { $in: OPEN } }))) {
    throw conflict("TABLE_HAS_OPEN_TAB", "Feche a conta desta mesa antes de desativá-la");
  }
  table.set(changes);
  if ((changes.x != null || changes.y != null || changes.active) && table.active) await checkCell(req, table, table._id);
  try {
    await table.save();
  } catch (error) {
    if (duplicateNumber(error)) throw numberTaken();
    throw error;
  }
  // La cuenta abierta muestra el número nuevo.
  if (changes.number != null) await Tab.updateMany({ commerce: req.commerce._id, table: table._id, status: { $in: OPEN } }, { $set: { tableNumber: table.number } });
  const changed = diffFields(before, table.toObject(), ["number", "name", "seats", "active"]);
  if (Object.keys(changed).length) await audit(req, { action: "table.updated", entity: { type: "table", id: table._id }, changes: changed });
  res.json({ table: tableView(table) });
};

// Acomodar varias mesas de una vez (arrastrar en el plano). Todas tienen que ser del local
// y no pueden quedar dos en la misma celda.
export const setTableLayout = async (req, res) => {
  const { positions } = req.valid.body;
  const ids = positions.map((position) => position.id);
  if (new Set(ids).size !== ids.length) throw badRequest("INVALID_LAYOUT", "Mesa repetida");
  const tables = await Table.find({ commerce: req.commerce._id }).lean();
  const mine = new Map(tables.map((table) => [String(table._id), table]));
  if (ids.some((id) => !mine.has(id))) throw tableNotFound();
  const next = new Map(tables.map((table) => [String(table._id), { x: table.x, y: table.y, active: table.active }]));
  for (const { id, x, y } of positions) next.set(id, { ...next.get(id), x, y });
  const cells = [...next.values()].filter((table) => table.active).map((table) => `${table.x},${table.y}`);
  if (new Set(cells).size !== cells.length) throw conflict("TABLE_POSITION_TAKEN", "Duas mesas não podem ficar no mesmo lugar");

  await mongoose.connection.transaction(async (session) => {
    for (const { id, x, y } of positions) await Table.updateOne({ _id: id, commerce: req.commerce._id }, { $set: { x, y } }, { session });
  });
  const updated = await Table.find({ commerce: req.commerce._id }).sort({ number: 1 }).lean();
  res.json({ tables: updated.map(tableView) });
};

// Borrar una mesa: solo si nunca tuvo cuentas abiertas ahora (las cerradas guardan su número).
export const deleteTable = async (req, res) => {
  const table = await findTable(req);
  if (await Tab.exists({ commerce: req.commerce._id, table: table._id, status: { $in: OPEN } })) {
    throw conflict("TABLE_HAS_OPEN_TAB", "Feche a conta desta mesa antes de apagá-la");
  }
  await table.deleteOne();
  await audit(req, { action: "table.deleted", entity: { type: "table", id: table._id }, changes: { number: table.number } });
  res.status(204).end();
};

// --- La cuenta de la mesa ---

export const getTableTab = async (req, res) => {
  const table = await findTable(req);
  const tab = await Tab.findOne({ commerce: req.commerce._id, table: table._id, status: { $in: OPEN } });
  if (!tab) return res.json({ table: tableView(table), tab: null, orders: [] });
  const orders = await ordersOf(req, tab._id);
  res.json({ table: tableView(table), tab: tabView(tab, orders, req.commerce), orders });
};

// Un pedido para la mesa: abre la cuenta si no hay una y entra a cocina confirmado.
export const createTableOrder = async (req, res) => {
  const table = await findTable(req);
  if (!table.active) throw conflict("TABLE_INACTIVE", "Esta mesa está desativada");
  const body = req.valid.body;
  const clientOrderId = body.clientOrderId ?? randomUUID();
  const repeated = await Order.findOne({ commerce: req.commerce._id, clientOrderId });
  if (repeated?.tab) {
    const repeatedTab = await Tab.findOne({ _id: repeated.tab, commerce: req.commerce._id });
    return res.json({ order: repeated, tab: tabView(repeatedTab, await ordersOf(req, repeated.tab), req.commerce) });
  }

  let tab = await Tab.findOne({ commerce: req.commerce._id, table: table._id, status: { $in: OPEN } });
  if (!tab) {
    try {
      tab = await Tab.create({ commerce: req.commerce._id, table: table._id, tableNumber: table.number, openTable: table._id, openedBy: req.user.id });
    } catch (error) {
      // Dos aparatos abrieron la misma mesa a la vez: se usa la que quedó.
      if (error.code !== 11000) throw error;
      tab = await Tab.findOne({ commerce: req.commerce._id, table: table._id, status: { $in: OPEN } });
    }
  }
  const order = await placeOrder({
    store: req.commerce,
    input: {
      clientOrderId,
      customer: { name: `Mesa ${table.number}` },
      fulfillment: "table",
      items: body.items,
      notes: body.notes,
      locale: "pt-BR",
    },
    channel: "counter",
    origin: "panel",
    user: req.user,
    atTable: { table: { _id: table._id, number: table.number, name: table.name }, tab: tab._id },
  });
  // La mesa vuelve a consumir: ya no está "pidiendo la cuenta".
  if (tab.status === "bill_requested") {
    tab.status = "open";
    tab.billRequestedAt = null;
    await tab.save();
  }
  res.status(201).json({ order, tab: tabView(tab, await ordersOf(req, tab._id), req.commerce) });
};

export const requestBill = async (req, res) => {
  const tab = await findOpenTab(req);
  if (tab.status === "open") {
    tab.status = "bill_requested";
    tab.billRequestedAt = new Date();
    await tab.save();
  }
  res.json({ tab: tabView(tab, await ordersOf(req, tab._id), req.commerce) });
};

// Sacar (o volver a poner) la tasa de servicio de una cuenta abierta: el cliente no la quiere pagar.
export const setServiceFee = async (req, res) => {
  const tab = await findOpenTab(req);
  const { waived } = req.valid.body;
  if (tab.serviceFeeWaived !== waived) {
    tab.serviceFeeWaived = waived;
    await tab.save();
    await audit(req, { action: waived ? "tab.service_fee_waived" : "tab.service_fee_restored", entity: { type: "tab", id: tab._id }, changes: { table: tab.tableNumber } });
  }
  res.json({ tab: tabView(tab, await ordersOf(req, tab._id), req.commerce) });
};

// Pasar la cuenta a otra mesa libre (la gente se cambió de lugar).
export const moveTab = async (req, res) => {
  const tab = await findOpenTab(req);
  const target = await findTable(req, req.valid.body.tableId);
  if (!target.active) throw conflict("TABLE_INACTIVE", "Esta mesa está desativada");
  if (String(target._id) === String(tab.table)) return res.json({ tab: tabView(tab, await ordersOf(req, tab._id), req.commerce) });
  const from = tab.tableNumber;
  try {
    await mongoose.connection.transaction(async (session) => {
      tab.table = target._id;
      tab.tableNumber = target.number;
      tab.openTable = target._id;
      await tab.save({ session });
      await Order.updateMany(
        { commerce: req.commerce._id, tab: tab._id },
        { $set: { table: { _id: target._id, number: target.number, name: target.name }, "customer.name": `Mesa ${target.number}` } },
        { session }
      );
    });
  } catch (error) {
    if (error.code === 11000) throw conflict("TABLE_HAS_OPEN_TAB", "A outra mesa já tem uma conta aberta");
    throw error;
  }
  await audit(req, { action: "tab.moved", entity: { type: "tab", id: tab._id }, changes: { from, to: target.number } });
  res.json({ tab: tabView(tab, await ordersOf(req, tab._id), req.commerce) });
};

// Cerrar la cuenta cobrando. Lo que esté listo se da por servido; si algo sigue en cocina,
// no se cierra (se cobraría algo que la mesa todavía no recibió). La forma de pago queda en
// cada pedido: así el cierre de caja los cuenta como a los demás.
export const closeTab = async (req, res) => {
  const tab = await findOpenTab(req);
  const { paymentMethod, changeForCents, payments: parts } = req.valid.body;
  const orders = await ordersOf(req, tab._id);
  const pending = orders.filter((order) => order.status === "new" || order.status === "confirmed");
  if (pending.length) {
    throw conflict("TAB_HAS_PENDING_ORDERS", "Há pedidos desta mesa ainda na cozinha. Marque-os como prontos ou cancele antes de fechar.", {
      orders: pending.map((order) => order.number),
    });
  }
  const { serviceFeeCents, totalCents: total } = tabAmounts(tab, orders, req.commerce);
  // Un pago con el total, o las partes de una cuenta dividida.
  const payments = parts ?? (paymentMethod && total > 0 ? [{ paymentMethod, amountCents: total, changeForCents }] : []);
  if (total > 0 && !payments.length) throw badRequest("PAYMENT_METHOD_REQUIRED", "Escolha a forma de pagamento");
  for (const part of payments) {
    if (!req.commerce.paymentMethods.includes(part.paymentMethod)) {
      throw badRequest("PAYMENT_METHOD_NOT_AVAILABLE", "Forma de pagamento não aceita neste estabelecimento");
    }
    if (part.paymentMethod === "cash" && part.changeForCents != null && part.changeForCents < part.amountCents) {
      throw badRequest("INVALID_CHANGE", "O troco precisa ser para um valor maior ou igual ao total");
    }
  }
  const paid = payments.reduce((sum, part) => sum + part.amountCents, 0);
  if (paid !== total) {
    throw badRequest("PAYMENTS_DONT_MATCH", "A soma dos pagamentos precisa ser igual ao total da conta", { totalCents: total, paidCents: paid });
  }
  const single = payments.length === 1 ? payments[0] : null;

  const now = new Date();
  await mongoose.connection.transaction(async (session) => {
    for (const order of orders.filter((item) => item.status === "ready")) {
      await Order.updateOne(
        { _id: order._id, commerce: req.commerce._id, status: "ready" },
        { $set: { status: "delivered" }, $push: { statusHistory: { status: "delivered", at: now, by: req.user.id, byName: req.user.name } } },
        { session }
      );
    }
    // Con un solo pago, cada pedido queda con esa forma (como un pedido cualquiera). Dividida, la
    // forma de cada parte está en la cuenta y el cierre de caja la cuenta desde ahí.
    if (single) {
      await Order.updateMany({ commerce: req.commerce._id, tab: tab._id, status: { $ne: "cancelled" } }, { $set: { paymentMethod: single.paymentMethod } }, { session });
    }
    tab.status = "closed";
    tab.openTable = undefined;
    tab.closedAt = now;
    tab.closedBy = req.user.id;
    tab.paymentMethod = single?.paymentMethod ?? null;
    tab.changeForCents = single?.paymentMethod === "cash" ? (single.changeForCents ?? null) : null;
    tab.payments = payments.map((part) => ({ ...part, changeForCents: part.paymentMethod === "cash" ? (part.changeForCents ?? null) : null }));
    tab.totalCents = total;
    tab.serviceFeeCents = serviceFeeCents;
    await tab.save({ session });
  });
  await audit(req, { action: "tab.closed", entity: { type: "tab", id: tab._id }, changes: { table: tab.tableNumber, totalCents: total, serviceFeeCents, payments: payments.map((part) => [part.paymentMethod, part.amountCents]) } });
  res.json({ tab: tabView(tab, await ordersOf(req, tab._id), req.commerce) });
};

// Precuenta para imprimir (la misma impresora y papel que la comanda).
export const getTabBill = async (req, res) => {
  const tab = await Tab.findOne({ _id: req.valid.params.id, commerce: req.commerce._id });
  if (!tab) throw tabNotFound();
  const orders = await ordersOf(req, tab._id);
  const { format, width } = req.valid.query;
  const text = buildBill(tab, orders, req.commerce, { paperWidth: width, amounts: tabAmounts(tab, orders, req.commerce) });
  if (format === "text") return res.type("text/plain; charset=utf-8").send(text);
  res.type("text/html; charset=utf-8").send(buildTicketHtml(text, { paperWidth: width, title: `Conta — Mesa ${tab.tableNumber}` }));
};
