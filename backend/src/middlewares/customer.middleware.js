import Customer from "../models/customer.model.js";
import { readCustomerSession } from "../lib/customerSession.js";
import { unauthorized } from "../lib/errors.js";

// Carga la cuenta en cada request: si se borró o cambió la contraseña, la sesión deja de valer.
async function loadCustomer(req) {
  const session = readCustomerSession(req);
  if (!session) return null;
  const customer = await Customer.findById(session.sub).select("+tokenVersion");
  if (!customer || customer.tokenVersion !== session.v) return null;
  return customer;
}

// Para lo que funciona igual sin cuenta (pedir): si hay sesión, req.customer.
export const customerOptional = async (req, res, next) => {
  req.customer = await loadCustomer(req);
  next();
};

export const customerRequired = async (req, res, next) => {
  req.customer = await loadCustomer(req);
  if (!req.customer) throw unauthorized("Entre na sua conta para continuar");
  next();
};
