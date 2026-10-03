// Crea (o actualiza) un usuario de prueba directo en la base, sin pasar por la API.
// Uso:
//   node crear-usuario-prueba.mjs <email@test.local> <password> superadmin
//   node crear-usuario-prueba.mjs <email@test.local> <password> owner <slug-del-local>
//   node crear-usuario-prueba.mjs <email@test.local> <password> staff <slug-del-local>
// Para owner y staff también crea el local (abierto, con WhatsApp de prueba) si no existe.
import { conectar, desconectar, importarDeRaiz } from "./conexion.mjs";

const [email, password, role, slug] = process.argv.slice(2);
const valido =
  email?.endsWith("@test.local") && password && (role === "superadmin" || (["owner", "staff"].includes(role) && slug));
if (!valido) {
  console.error("Uso: node crear-usuario-prueba.mjs <email@test.local> <password> superadmin");
  console.error("     node crear-usuario-prueba.mjs <email@test.local> <password> owner|staff <slug>");
  console.error("Solo emails @test.local, así limpiar-prueba.mjs los encuentra.");
  process.exit(1);
}

await conectar();
const { default: User } = await importarDeRaiz("src/models/user.model.js");
const { default: Commerce } = await importarDeRaiz("src/models/commerce.model.js");
const { hashPassword } = await importarDeRaiz("src/lib/passwords.js");

let commerce = null;
if (role !== "superadmin") {
  commerce =
    (await Commerce.findOne({ slug })) ??
    (await Commerce.create({ name: `Loja ${slug}`, slug, whatsapp: "+5555999990000", override: { mode: "open", until: null } }));
}

const usuario = await User.findOneAndUpdate(
  { email },
  {
    $set: {
      name: email.split("@")[0],
      role,
      active: true,
      passwordHash: await hashPassword(password),
      ...(commerce ? { commerce: commerce._id } : {}),
    },
    ...(commerce ? {} : { $unset: { commerce: 1 } }),
  },
  { upsert: true, returnDocument: "after", runValidators: true }
);
console.log(`Listo: ${usuario.email} (rol: ${usuario.role}${commerce ? `, local: /${commerce.slug}` : ""})`);

await desconectar();
