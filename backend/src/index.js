// dotenv va primero: los módulos de abajo leen process.env al importarse.
import "dotenv/config";
import mongoose from "mongoose";
import { config } from "./config.js";
import connectDB from "./db.js";
import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";
import { startJobs, stopJobs } from "./jobs/index.js";

try {
  await connectDB();
  logger.info("MongoDB connected successfully");
} catch (error) {
  logger.fatal(`Error connecting to MongoDB: ${error.message}`);
  process.exit(1);
}

const server = createApp().listen(config.PORT, () => logger.info(`Server running on port ${config.PORT}`));
startJobs();

// Cierre ordenado (deploys, reinicios): deja de aceptar requests, termina las que
// están en curso y cierra Mongo. Si algo se cuelga, corta a los 10 segundos.
let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  logger.info(`${signal} recibido: cerrando`);
  stopJobs();
  setTimeout(() => {
    logger.error("El cierre tardó demasiado: saliendo igual");
    process.exit(1);
  }, 10_000).unref();
  server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
  server.closeIdleConnections();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
