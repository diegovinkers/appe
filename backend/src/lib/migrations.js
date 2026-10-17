import User from "../models/user.model.js";
import { logger } from "./logger.js";

// Cambios de índices que Mongoose no hace solo. Corre al arrancar y no hace nada si ya está.
export async function runMigrations() {
  // El email era único para todos (un usuario sin email chocaba con el siguiente): pasa a ser
  // único solo entre los que tienen email.
  const indexes = await User.collection.indexes().catch(() => []);
  const old = indexes.find((index) => index.name === "email_1" && !index.partialFilterExpression);
  if (old) {
    await User.collection.dropIndex("email_1");
    logger.info("migración: índice email_1 de users reemplazado");
  }
  await User.createIndexes();
}
