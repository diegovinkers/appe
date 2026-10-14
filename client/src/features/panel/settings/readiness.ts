import type { OwnerStore } from "../../../api/types";
import type { SettingsKey } from "../nav";

// Qué tarjetas de Configurações están listas para recibir pedidos. Las que no aparecen acá
// (link y QR, assinatura) no tienen nada obligatorio.
export function settingsReadiness(store: OwnerStore): Partial<Record<SettingsKey, boolean>> {
  return {
    storeInfo: Boolean(store.name && store.whatsapp && store.address),
    hours: Object.values(store.hours.weekly).some((day) => day.length > 0),
    delivery:
      store.fulfillment.pickup ||
      (store.fulfillment.delivery && (store.deliveryMode === "fixed" || store.deliveryZones.some((zone) => zone.active))),
    payments: store.paymentMethods.length > 0 && (!store.paymentMethods.includes("pix") || Boolean(store.pixKey.trim())),
  };
}
