import Subscription from "../../models/subscription.model.js";
import { todayIn } from "../../lib/dates.js";

const normalizedPlan = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase();

// WhatsApp con IA pertenece a Member Plus. La fecha se compara con la zona horaria
// de operación definida por el backend; una fecha vacía significa sin vencimiento manual.
export async function hasAssistantPlus(commerceId) {
  const subscription = await Subscription.findOne({ commerce: commerceId }).select("plan status dueDate").lean();
  return Boolean(
    subscription?.status === "active" &&
    normalizedPlan(subscription.plan) === "member plus" &&
    (!subscription.dueDate || subscription.dueDate >= todayIn())
  );
}
