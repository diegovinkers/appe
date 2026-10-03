// Crea el superadmin (la cuenta de la plataforma) o le cambia la contraseña si ya existe.
// Uso: npm run create-superadmin -- <email> <contraseña> [nombre]
// También toma SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD y SUPERADMIN_NAME del entorno.
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../src/db.js";
import User from "../src/models/user.model.js";
import { hashPassword } from "../src/lib/passwords.js";
import { email as emailSchema, newPassword } from "../src/schemas/common.schema.js";

const [argEmail, argPassword, argName] = process.argv.slice(2);
const email = emailSchema.safeParse(argEmail ?? process.env.SUPERADMIN_EMAIL ?? "");
const password = newPassword.safeParse(argPassword ?? process.env.SUPERADMIN_PASSWORD ?? "");
const name = argName ?? process.env.SUPERADMIN_NAME ?? "Superadmin";

if (!email.success || !password.success) {
  console.error("Uso: npm run create-superadmin -- <email> <contraseña de 8+ caracteres> [nombre]");
  process.exit(1);
}

await connectDB();
const existing = await User.findOne({ email: email.data });
if (existing && existing.role !== "superadmin") {
  console.error(`${email.data} ya existe y es un dueño de local: usá otro email.`);
  await mongoose.disconnect();
  process.exit(1);
}

await User.findOneAndUpdate(
  { email: email.data },
  {
    $set: { name, role: "superadmin", active: true, passwordHash: await hashPassword(password.data) },
    // Cierra las sesiones anteriores si ya existía.
    $inc: { tokenVersion: 1 },
  },
  { upsert: true, runValidators: true }
);
console.log(`Superadmin ${existing ? "actualizado" : "creado"}: ${email.data}`);
await mongoose.disconnect();
