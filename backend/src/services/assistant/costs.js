// Cuánto cuesta la IA. Precios en dólares por millón de tokens, de la página de precios de
// Anthropic: revisarlos al cambiar de modelo. La escritura en caché es la de 5 minutos.
import { dayRange, todayIn } from "../../lib/dates.js";
import ConversationMessage from "../../models/conversationMessage.model.js";

export const AI_PRICES = {
  "claude-haiku-4-5": { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};

// El modelo puede venir con fecha ("claude-haiku-4-5-20251001").
export const priceOf = (model) =>
  Object.entries(AI_PRICES).find(([name]) => model === name || model?.startsWith(`${name}-`))?.[1] ?? null;

// En millonésimos de dólar: tokens × (US$ por millón) da justo esa unidad.
// null si el modelo no tiene precio cargado.
export function costMicros(model, usage) {
  const price = priceOf(model);
  if (!price) return null;
  return Math.round(
    usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheWriteTokens * price.cacheWrite +
      usage.cacheReadTokens * price.cacheRead
  );
}

// Primer instante del mes en curso (hora de Brasil) y su "YYYY-MM".
export function currentMonth(now = new Date()) {
  const today = todayIn(undefined, now);
  return { month: today.slice(0, 7), start: dayRange(`${today.slice(0, 8)}01`).start };
}

// Lo gastado en IA por el local en el mes en curso, en millonésimos de dólar.
export async function monthSpendMicros(commerceId, now = new Date()) {
  const [row] = await ConversationMessage.aggregate([
    { $match: { commerce: commerceId, role: "assistant", createdAt: { $gte: currentMonth(now).start } } },
    { $group: { _id: null, total: { $sum: "$usage.costMicros" } } },
  ]);
  return row?.total ?? 0;
}
