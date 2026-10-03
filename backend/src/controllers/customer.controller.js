import Customer from "../models/customer.model.js";
import Order from "../models/order.model.js";
import { AppError, conflict } from "../lib/errors.js";
import { endCustomerSession, startCustomerSession } from "../lib/customerSession.js";
import { checkPassword, hashPassword } from "../lib/passwords.js";
import { customerOrders, customerView, linkOrders } from "../services/customer.service.js";
import { forgetConversationsOf } from "../services/assistant/privacy.js";

// Se compara contra este hash cuando el teléfono no tiene cuenta: la respuesta tarda lo
// mismo y no revela qué teléfonos están registrados.
const dummyHash = hashPassword("senha-que-nao-existe");
const invalidCredentials = () => new AppError(401, "CUSTOMER_INVALID_CREDENTIALS", "WhatsApp ou senha incorretos");

// POST /api/customer/signup — la cuenta con lo mínimo; entra directo.
export const signup = async (req, res) => {
  const { name, phone, password, locale, address, orderTokens } = req.valid.body;
  let customer;
  try {
    customer = await Customer.create({
      name,
      phone,
      locale,
      passwordHash: await hashPassword(password),
      addresses: address ? [address] : [],
    });
  } catch (error) {
    if (error.code === 11000) throw conflict("PHONE_TAKEN", "Esse WhatsApp já tem conta. Entre com sua senha.");
    throw error;
  }
  const linkedOrders = await linkOrders(customer, orderTokens);
  startCustomerSession(res, customer);
  res.status(201).json({ customer: customerView(customer), linkedOrders });
};

// POST /api/customer/login
export const login = async (req, res) => {
  const { phone, password, orderTokens } = req.valid.body;
  const customer = await Customer.findOne({ phone }).select("+passwordHash +tokenVersion");
  const matches = await checkPassword(password, customer?.passwordHash ?? (await dummyHash));
  if (!customer || !matches) throw invalidCredentials();
  const linkedOrders = await linkOrders(customer, orderTokens);
  startCustomerSession(res, customer);
  res.json({ customer: customerView(customer), linkedOrders });
};

export const logout = (req, res) => {
  endCustomerSession(res);
  res.status(204).end();
};

// GET /api/customer/me
export const me = (req, res) => res.json({ customer: customerView(req.customer) });

// PATCH /api/customer/me — nombre, idioma o la lista de direcciones (reemplaza la lista).
export const updateMe = async (req, res) => {
  const customer = req.customer;
  const { addresses, ...fields } = req.valid.body;
  customer.set(fields);
  if (addresses) customer.addresses = addresses;
  await customer.save();
  res.json({ customer: customerView(customer) });
};

// GET /api/customer/orders
export const myOrders = async (req, res) => res.json({ orders: await customerOrders(req.customer._id) });

// POST /api/customer/orders/link — pedidos hechos desde este aparato antes de entrar.
export const linkMyOrders = async (req, res) => {
  const linkedOrders = await linkOrders(req.customer, req.valid.body.orderTokens);
  res.json({ linkedOrders });
};

// POST /api/customer/me/delete — borra la cuenta (LGPD). Los pedidos quedan en cada
// local, pero ya no apuntan a la cuenta. Sus conversaciones con el asistente se borran.
export const deleteMe = async (req, res) => {
  const customer = await Customer.findById(req.customer._id).select("+passwordHash");
  if (!(await checkPassword(req.valid.body.password, customer.passwordHash))) throw invalidCredentials();
  await Order.updateMany({ account: customer._id }, { $set: { account: null } });
  await Customer.deleteOne({ _id: customer._id });
  await forgetConversationsOf(customer.phone);
  endCustomerSession(res);
  res.status(204).end();
};
