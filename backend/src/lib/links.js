import { config } from "../config.js";

// Link público del menú del local (el que va en Instagram, WhatsApp y el QR).
export const storeUrl = (commerce) => `${config.PUBLIC_WEB_URL}/${commerce.slug}`;

// Link de seguimiento del cliente. Los pedidos anteriores al seguimiento no tienen.
export const trackingUrl = (order) => (order.trackingToken ? `${config.PUBLIC_WEB_URL}/pedido/${order.trackingToken}` : null);
