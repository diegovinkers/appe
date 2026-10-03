import request from "supertest";
import Category from "../src/models/category.model.js";
import Commerce from "../src/models/commerce.model.js";
import OptionGroup from "../src/models/optionGroup.model.js";
import Product from "../src/models/product.model.js";
import User from "../src/models/user.model.js";
import { hashPassword } from "../src/lib/passwords.js";

export const PASSWORD = "senha-de-teste-123";

export async function createSuperadmin(email = "root@test.local") {
  return User.create({ name: "Root", email, role: "superadmin", passwordHash: await hashPassword(PASSWORD) });
}

// Crea un local abierto con su dueño, directo en la base.
export async function createCommerceWithOwner({ slug = "loja-a", email, ...commerceData } = {}) {
  const commerce = await Commerce.create({
    name: `Loja ${slug}`,
    slug,
    whatsapp: "+5555999990000",
    // Abierto a mano, sin horario: los tests no dependen de la hora en que corren.
    override: { mode: "open", until: null },
    ...commerceData,
  });
  const owner = await User.create({
    name: `Dono ${slug}`,
    email: email ?? `dono-${slug}@test.local`,
    role: "owner",
    commerce: commerce._id,
    passwordHash: await hashPassword(PASSWORD),
  });
  return { commerce, owner };
}

// Empleado (staff) de un local.
export async function createStaff(commerce, email = `staff-${commerce.slug}@test.local`) {
  return User.create({
    name: "Atendente",
    email,
    role: "staff",
    commerce: commerce._id,
    passwordHash: await hashPassword(PASSWORD),
  });
}

// Menú chico de hamburguesería, compartido por los tests de menú y de pedidos.
export async function createMenu(commerce) {
  const commerceId = commerce._id;
  const lanches = await Category.create({ commerce: commerceId, name: "Lanches", position: 0 });
  const bebidas = await Category.create({ commerce: commerceId, name: "Bebidas", position: 1 });
  const ponto = await OptionGroup.create({
    commerce: commerceId,
    name: "Ponto da carne",
    minSelect: 1,
    maxSelect: 1,
    options: [{ name: "Mal passado" }, { name: "Ao ponto" }, { name: "Bem passado" }],
  });
  const adicionais = await OptionGroup.create({
    commerce: commerceId,
    name: "Adicionais",
    minSelect: 0,
    maxSelect: 3,
    options: [
      { name: "Bacon", priceCents: 400 },
      { name: "Cheddar", priceCents: 300 },
      { name: "Ovo", priceCents: 200 },
    ],
  });
  const xBurger = await Product.create({
    commerce: commerceId,
    category: lanches._id,
    name: "X-Burger",
    priceCents: 2500,
    position: 0,
    optionGroups: [ponto._id, adicionais._id],
  });
  const xSalada = await Product.create({
    commerce: commerceId,
    category: lanches._id,
    name: "X-Salada",
    priceCents: 2700,
    position: 1,
    optionGroups: [ponto._id],
  });
  const coca = await Product.create({
    commerce: commerceId,
    category: bebidas._id,
    name: "Coca-Cola 350ml",
    priceCents: 600,
    position: 0,
  });
  return { lanches, bebidas, ponto, adicionais, xBurger, xSalada, coca };
}

// Devuelve un agente de supertest que guarda la cookie de sesión.
export async function loginAs(app, email, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ email, password });
  if (res.status !== 200) throw new Error(`login falló: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

// Busca una clave en cualquier nivel de un JSON (para chequear que nunca se filtre).
export function containsKey(value, key) {
  if (Array.isArray(value)) return value.some((item) => containsKey(item, key));
  if (value && typeof value === "object") {
    return Object.entries(value).some(([k, v]) => k === key || containsKey(v, key));
  }
  return false;
}
