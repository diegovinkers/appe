import Subscription, { planName } from "../../models/subscription.model.js";
import { todayIn } from "../../lib/dates.js";

// WhatsApp con IA pertenece al plan Plus. La fecha se compara con la zona horaria
// de operación definida por el backend; una fecha vacía significa sin vencimiento manual.
export async function hasAssistantPlus(commerceId) {
  const subscription = await Subscription.findOne({ commerce: commerceId }).select("plan status dueDate").lean();
  return Boolean(
    subscription?.status === "active" &&
    planName(subscription.plan) === "Plus" &&
    (!subscription.dueDate || subscription.dueDate >= todayIn())
  );
}
