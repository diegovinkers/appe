// Crea (o rehace) el local de demo /burger-demo con su dueño y un menú completo.
// Uso: npm run seed -- <email del dueño> <contraseña> <whatsapp del local>
// También toma SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD y SEED_WHATSAPP del entorno.
// Se puede correr varias veces: rehace el menú sin duplicar nada y no toca los pedidos.
// El WhatsApp tiene que ser tuyo: los pedidos de prueba se mandan a ese número.
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../src/db.js";
import Category from "../src/models/category.model.js";
import Commerce from "../src/models/commerce.model.js";
import Coupon from "../src/models/coupon.model.js";
import OptionGroup from "../src/models/optionGroup.model.js";
import Product from "../src/models/product.model.js";
import User from "../src/models/user.model.js";
import { hashPassword } from "../src/lib/passwords.js";
import { email as emailSchema, newPassword, phone } from "../src/schemas/common.schema.js";

const SLUG = "burger-demo";

const [argEmail, argPassword, argWhatsapp] = process.argv.slice(2);
const email = emailSchema.safeParse(argEmail ?? process.env.SEED_OWNER_EMAIL ?? "");
const password = newPassword.safeParse(argPassword ?? process.env.SEED_OWNER_PASSWORD ?? "");
const whatsapp = phone.safeParse(argWhatsapp ?? process.env.SEED_WHATSAPP ?? "");

if (!email.success || !password.success || !whatsapp.success) {
  console.error("Uso: npm run seed -- <email del dueño> <contraseña de 8+ caracteres> <whatsapp con DDD>");
  process.exit(1);
}

// Abre todos los días de 9:00 a 23:30 (viernes y sábado hasta la 1:00): así la demo se
// puede mostrar a cualquier hora del día y se ve el horario funcionando.
const everyDay = [{ open: "09:00", close: "23:30" }];
const lateNight = [{ open: "09:00", close: "01:00" }];

const store = {
  name: "Burger Demo",
  slug: SLUG,
  status: "active",
  description: "Hambúrgueres artesanais na fronteira. Peça pelo link e receba em casa.",
  about: "Hambúrgueres feitos na hora, com pão brioche e carne de primeira. Atendemos também em espanhol.",
  translations: {
    es: {
      description: "Hamburguesas artesanales en la frontera. Pedí por el link y recibilo en tu casa.",
      about: "Hamburguesas hechas en el momento, con pan brioche y carne de primera.",
      notice: "",
    },
  },
  notice: "",
  instagram: "",
  coverUrl: "",
  address: "Av. Brasil, 1000 — Centro, Quaraí/RS",
  whatsapp: whatsapp.data,
  primaryColor: "#D9480F",
  secondaryColor: "#212529",
  hours: {
    weekly: { sun: everyDay, mon: everyDay, tue: everyDay, wed: everyDay, thu: everyDay, fri: lateNight, sat: lateNight },
    exceptions: [],
  },
  override: null,
  fulfillment: { delivery: true, pickup: true },
  estimates: { deliveryMin: 40, deliveryMax: 60, pickupMin: 20, pickupMax: 30 },
  deliveryMode: "zones",
  deliveryFeeCents: 500,
  deliveryZones: [
    { name: "Centro", feeCents: 400 },
    { name: "Colina Santa Teresa", feeCents: 600 },
    { name: "Outros bairros", feeCents: 1000, estimateMin: 50, estimateMax: 80 },
  ],
  freeDeliveryFromCents: 8000,
  minOrderCents: 2000,
  paymentMethods: ["cash", "pix", "card"],
  // En la demo, la chave Pix es el mismo número de WhatsApp.
  pixKey: whatsapp.data,
  scheduling: { enabled: true, minLeadMinutes: 30, maxDaysAhead: 2, slotMinutes: 30 },
};

const groups = {
  ponto: {
    name: "Ponto da carne",
    translations: { es: { name: "Punto de la carne" } },
    minSelect: 1,
    maxSelect: 1,
    options: [{ name: "Mal passado" }, { name: "Ao ponto" }, { name: "Bem passado" }],
  },
  adicionais: {
    name: "Adicionais",
    translations: { es: { name: "Extras" } },
    minSelect: 0,
    maxSelect: 5,
    options: [
      { name: "Bacon", priceCents: 400, maxQuantity: 2 },
      { name: "Cheddar", priceCents: 300 },
      { name: "Ovo", priceCents: 200 },
      { name: "Hambúrguer extra", priceCents: 700, maxQuantity: 2 },
      { name: "Cebola caramelizada", priceCents: 300, available: false },
    ],
  },
  molhos: {
    name: "Molhos",
    translations: { es: { name: "Salsas" } },
    minSelect: 0,
    maxSelect: 2,
    options: [
      { name: "Maionese da casa" },
      { name: "Barbecue" },
      { name: "Mostarda e mel" },
      { name: "Maionese verde", priceCents: 200 },
    ],
  },
};

const burger = ["ponto", "adicionais", "molhos"];
const menu = [
  {
    name: "Hambúrgueres",
    es: "Hamburguesas",
    products: [
      ["X-Burger", "Pão brioche, hambúrguer 150 g, queijo e maionese da casa.", 2500, burger],
      ["X-Salada", "Hambúrguer 150 g, queijo, alface, tomate e maionese da casa.", 2700, burger],
      ["X-Bacon", "Hambúrguer 150 g, queijo, bacon crocante e maionese da casa.", 3200, burger, true, { featured: true }],
      ["X-Egg", "Hambúrguer 150 g, queijo, ovo e maionese da casa.", 2900, burger],
      ["X-Tudo", "Dois hambúrgueres, queijo, bacon, ovo, presunto, alface e tomate.", 3800, burger],
      ["Smash duplo", "Dois smash de 90 g, cheddar e cebola na chapa.", 3400, ["adicionais", "molhos"], true, { featured: true, tags: ["new"] }],
    ],
  },
  {
    name: "Lanches",
    es: "Sándwiches",
    products: [
      ["Chivito", "O clássico uruguaio: bife, presunto, queijo, ovo, alface e tomate.", 4200, ["ponto", "molhos"]],
      ["Cachorro-quente", "Pão, duas salsichas, molho de tomate, milho, batata palha.", 1800, ["molhos"]],
      ["Misto-quente", "Pão de forma, presunto e queijo na chapa.", 1400, []],
    ],
  },
  {
    name: "Porções",
    es: "Porciones",
    products: [
      ["Batata frita pequena", "200 g.", 1500, ["molhos"], true, { tags: ["vegetarian"] }],
      ["Batata frita grande", "400 g, serve duas pessoas.", 2500, ["molhos"], true, { tags: ["vegetarian"], promoPriceCents: 2200 }],
      ["Batata com cheddar e bacon", "400 g de batata com cheddar cremoso e bacon.", 3200, []],
      ["Onion rings", "Anéis de cebola empanados, 250 g.", 2200, ["molhos"], false],
    ],
  },
  {
    name: "Bebidas",
    products: [
      ["Coca-Cola lata 350 ml", "", 600, []],
      ["Guaraná Antarctica lata 350 ml", "", 600, []],
      ["Água mineral 500 ml", "Com ou sem gás.", 400, []],
      ["Suco de laranja 500 ml", "Natural, feito na hora.", 900, []],
    ],
  },
  {
    name: "Sobremesas",
    es: "Postres",
    products: [
      ["Brownie com sorvete", "Brownie de chocolate com uma bola de sorvete de creme.", 1800, []],
      ["Milkshake de chocolate", "400 ml.", 1900, []],
    ],
  },
];

await connectDB();

const existingOwner = await User.findOne({ email: email.data });
const existingStore = await Commerce.findOne({ slug: SLUG }).select("_id");
if (existingOwner && String(existingOwner.commerce) !== String(existingStore?._id)) {
  console.error(`${email.data} ya existe y no es el dueño de /${SLUG}: usá otro email.`);
  await mongoose.disconnect();
  process.exit(1);
}

const commerce = await Commerce.findOneAndUpdate(
  { slug: SLUG },
  { $set: store },
  { upsert: true, returnDocument: "after", runValidators: true }
);

await User.findOneAndUpdate(
  { email: email.data },
  {
    $set: {
      name: "Dono Burger Demo",
      role: "owner",
      commerce: commerce._id,
      active: true,
      passwordHash: await hashPassword(password.data),
    },
    $inc: { tokenVersion: 1 },
  },
  { upsert: true, runValidators: true }
);

// El menú se rehace entero; los pedidos viejos guardan sus propios nombres y precios.
await Promise.all([
  Category.deleteMany({ commerce: commerce._id }),
  Product.deleteMany({ commerce: commerce._id }),
  OptionGroup.deleteMany({ commerce: commerce._id }),
]);

const groupIds = {};
for (const [key, group] of Object.entries(groups)) {
  groupIds[key] = (await OptionGroup.create({ ...group, commerce: commerce._id }))._id;
}

let productCount = 0;
for (const [position, category] of menu.entries()) {
  const { _id: categoryId } = await Category.create({
    commerce: commerce._id,
    name: category.name,
    position,
    translations: { es: { name: category.es ?? "" } },
  });
  await Product.insertMany(
    category.products.map(([name, description, priceCents, groupKeys, available = true, extras = {}], index) => ({
      commerce: commerce._id,
      category: categoryId,
      name,
      description,
      priceCents,
      available,
      position: index,
      optionGroups: groupKeys.map((key) => groupIds[key]),
      ...extras,
    }))
  );
  productCount += category.products.length;
}

// Cupón para mostrar en la demo: 10% en pedidos desde R$ 30.
await Coupon.findOneAndUpdate(
  { commerce: commerce._id, code: "DEMO10" },
  {
    $set: { type: "percent", value: 10, minOrderCents: 3000, active: true, description: "Cupom da demo" },
    $setOnInsert: { uses: 0 },
  },
  { upsert: true, runValidators: true }
);

console.log(`Local de demo listo: /${SLUG} (${menu.length} categorías, ${productCount} productos, cupón DEMO10).`);
console.log(`Dueño: ${email.data}`);
await mongoose.disconnect();
