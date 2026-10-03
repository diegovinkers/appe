import Commerce from "../models/commerce.model.js";
import { todayIn } from "../lib/dates.js";

// Borra las excepciones de horario de días que ya pasaron y los overrides vencidos.
// No cambia el comportamiento (ya se ignoran), pero mantiene los documentos chicos y claros.
export async function cleanupStoreSchedules(now = new Date()) {
  const [exceptions, overrides] = await Promise.all([
    Commerce.updateMany(
      { "hours.exceptions.date": { $lt: todayIn(undefined, now) } },
      { $pull: { "hours.exceptions": { date: { $lt: todayIn(undefined, now) } } } }
    ),
    Commerce.updateMany({ "override.until": { $ne: null, $lte: now } }, { $set: { override: null } }),
  ]);
  return { exceptionsCleaned: exceptions.modifiedCount, overridesCleared: overrides.modifiedCount };
}
