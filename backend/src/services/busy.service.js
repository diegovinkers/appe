// "Muito movimento": el local suma minutos a todos los tiempos estimados por un rato (un
// viernes a la noche). Lo usan el menú, el asistente y la previsión de cada pedido nuevo.
export const BUSY_MINUTES = [15, 30, 45, 60];

// Minutos de más ahora (0 si no hay o ya venció).
export const busyExtraMinutes = (store, now = new Date()) => (store.busy?.until > now ? store.busy.extraMinutes : 0);

// El modo vigente, para mostrar; null si no hay.
export const activeBusy = (store, now = new Date()) =>
  busyExtraMinutes(store, now) ? { extraMinutes: store.busy.extraMinutes, until: store.busy.until } : null;

const plus = (minutes, extra) => (minutes == null ? null : minutes + extra);

// Tiempos estimados del local, con el extra.
export function currentEstimates(store, now = new Date()) {
  const extra = busyExtraMinutes(store, now);
  const { deliveryMin, deliveryMax, pickupMin, pickupMax } = store.estimates;
  return { deliveryMin: deliveryMin + extra, deliveryMax: deliveryMax + extra, pickupMin: pickupMin + extra, pickupMax: pickupMax + extra };
}

// Tiempos propios de un barrio (null = los del local), con el extra.
export function zoneEstimates(zone, store, now = new Date()) {
  const extra = busyExtraMinutes(store, now);
  return { estimateMin: plus(zone.estimateMin, extra), estimateMax: plus(zone.estimateMax, extra) };
}
