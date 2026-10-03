// Conecta a la misma base que el servidor reutilizando src/db.js
// (misma MONGO_URI y mismo dbName). Nunca imprime la URI.
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

const raiz = new URL("../../../../", import.meta.url);

export const importarDeRaiz = (ruta) => import(new URL(ruta, raiz).href);

export async function conectar() {
  // dotenv lee el .env de la carpeta actual, y src/config.js lo necesita cargado.
  process.chdir(fileURLToPath(raiz));
  await import("dotenv/config");
  const { default: connectDB } = await importarDeRaiz("src/db.js");
  try {
    await connectDB();
  } catch (error) {
    console.error("No se pudo conectar a MongoDB:", error.message);
    process.exit(1);
  }
  return mongoose.connection;
}

export const desconectar = () => mongoose.disconnect();
