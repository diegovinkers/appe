// Muestra las colecciones de la base y cuántos documentos tiene cada una.
// Solo lee: no muestra documentos ni la URI.
import { conectar, desconectar } from "./conexion.mjs";

const conexion = await conectar();
console.log(`Base: ${conexion.name}`);

const colecciones = await conexion.db.listCollections().toArray();
if (!colecciones.length) console.log("La base está vacía.");
for (const { name } of colecciones.sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(`- ${name}: ${await conexion.db.collection(name).countDocuments()}`);
}

const dePrueba = await conexion.db.collection("users").countDocuments({ email: /@test\.local$/ });
console.log(`Usuarios de prueba (@test.local): ${dePrueba}`);

await desconectar();
