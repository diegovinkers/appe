// Contacto de soporte de la plataforma (VITE_SUPPORT_CONTACT_URL; si no está, el comercial).
// Solo https o mailto, como en la página comercial.
export function supportContact(): string | null {
  const value = (import.meta.env.VITE_SUPPORT_CONTACT_URL as string | undefined) || (import.meta.env.VITE_SALES_CONTACT_URL as string | undefined);
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
