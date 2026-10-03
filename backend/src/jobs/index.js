import { logger } from "../lib/logger.js";
import { cleanupOldConversations } from "../services/assistant/privacy.js";
import { cleanupStoreSchedules } from "./maintenance.js";
import { scheduleJob, stopAllJobs } from "./scheduler.js";

const HOUR = 60 * 60 * 1000;

// Jobs programados: { name, schedule (cron, hora de Brasil), lockMs, run }.
export const JOBS = [
  { name: "cleanup-store-schedules", schedule: "30 3 * * *", lockMs: HOUR, run: cleanupStoreSchedules },
  // LGPD: las conversaciones del asistente no se guardan para siempre.
  { name: "cleanup-assistant-conversations", schedule: "45 3 * * *", lockMs: HOUR, run: cleanupOldConversations },
];

export function startJobs() {
  for (const job of JOBS) scheduleJob(job);
  if (JOBS.length) logger.info(`Jobs programados: ${JOBS.map((job) => job.name).join(", ")}`);
}

export const stopJobs = stopAllJobs;
