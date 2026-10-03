import { randomUUID } from "node:crypto";
import cron from "node-cron";
import JobLock from "../models/jobLock.model.js";
import { TIME_ZONE } from "../lib/dates.js";
import { logger } from "../lib/logger.js";

const INSTANCE_ID = randomUUID();

// Toma el lock del job si está libre o vencido. Devuelve true si lo tomó esta instancia.
export async function acquireLock(name, ttlMs, now = new Date()) {
  try {
    const lock = await JobLock.findOneAndUpdate(
      { _id: name, $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] },
      { $set: { lockedUntil: new Date(now.getTime() + ttlMs), lockedBy: INSTANCE_ID } },
      { upsert: true, returnDocument: "after" }
    );
    return lock.lockedBy === INSTANCE_ID;
  } catch (error) {
    // Estaba tomado: el filtro no coincidió y el upsert chocó con el _id existente.
    if (error.code === 11000) return false;
    throw error;
  }
}

// Corre el job si consigue el lock. El lock no se libera al terminar: dura `ttlMs`,
// así otra instancia no repite el mismo job en esa ventana.
export async function runJob({ name, run, lockMs }) {
  if (!(await acquireLock(name, lockMs))) return false;
  const log = logger.child({ job: name });
  try {
    const result = await run();
    log.info({ result }, "job terminado");
  } catch (error) {
    log.error({ err: error }, "job falló");
  }
  return true;
}

// `schedule` es una expresión cron en hora de Brasil (ej. "0 4 * * *" = todos los días a las 4:00).
export const scheduleJob = (job) =>
  cron.schedule(job.schedule, () => runJob(job), { name: job.name, timezone: TIME_ZONE });

export const stopAllJobs = () => {
  for (const task of cron.getTasks().values()) task.stop();
};
