// Borra los datos de prueba: usuarios con email @test.local, los locales de esos
// usuarios y todo documento de cualquier colección que apunte a esos locales
// (campo `commerce`). Un modelo nuevo con campo `commerce` se limpia solo.
// Un local se borra solo si TODOS sus usuarios son de prueba: si un usuario de prueba
// quedó colgado de un local real (ej. un empleado de prueba en la demo), se borra el
// usuario pero el local no.
import { conectar, desconectar } from "./conexion.mjs";

const TEST_EMAIL = /@test\.local$/;

const conexion = await conectar();
const db = conexion.db;

const usuarios = await db.collection("users").find({ email: TEST_EMAIL }).project({ commerce: 1 }).toArray();
const candidatos = [...new Set(usuarios.map((u) => u.commerce).filter(Boolean).map(String))];

const idsLocales = [];
const conservados = [];
for (const id of candidatos) {
  const commerce = usuarios.find((u) => String(u.commerce) === id).commerce;
  const reales = await db.collection("users").countDocuments({ commerce, email: { $not: TEST_EMAIL } });
  if (reales === 0) idsLocales.push(commerce);
  else conservados.push(id);
}

// Cuentas de clientes (el que compra) que solo pidieron en locales de prueba. Van antes
// que los pedidos, que es por donde se las encuentra. Si también compraron en un local
// real, se quedan.
const clientesPrueba = [];
if (idsLocales.length) {
  const cuentasConPedidos = await db.collection("orders").distinct("account", { commerce: { $in: idsLocales }, account: { $ne: null } });
  for (const account of cuentasConPedidos) {
    const reales = await db.collection("orders").countDocuments({ account, commerce: { $nin: idsLocales } });
    if (reales === 0) clientesPrueba.push(account);
  }
}
const clientes = await db.collection("customers").deleteMany({ _id: { $in: clientesPrueba } });

const borrados = [];
if (clientes.deletedCount) borrados.push(`${clientes.deletedCount} en customers`);
if (idsLocales.length) {
  for (const { name } of await db.listCollections().toArray()) {
    if (name === "users" || name === "commerces") continue;
    const { deletedCount } = await db.collection(name).deleteMany({ commerce: { $in: idsLocales } });
    if (deletedCount) borrados.push(`${deletedCount} en ${name}`);
  }
}
const locales = await db.collection("commerces").deleteMany({ _id: { $in: idsLocales } });
const cuentas = await db.collection("users").deleteMany({ _id: { $in: usuarios.map((u) => u._id) } });

borrados.unshift(`${cuentas.deletedCount} usuarios`, `${locales.deletedCount} locales`);
console.log(`Borrados: ${borrados.join(", ")}.`);
if (conservados.length) console.log(`Locales conservados porque tienen usuarios reales: ${conservados.length}.`);

await desconectar();
