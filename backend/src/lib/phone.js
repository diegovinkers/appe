// Normaliza teléfonos a E.164 (+5555999998888). Devuelve null si no es válido.
// Sin código de país se asume Brasil (+55). También se aceptan números de Uruguay
// (+598), porque Quaraí está en la frontera con Artigas.
export function normalizePhone(input) {
  const raw = String(input ?? "").trim();
  let digits = raw.replace(/\D/g, "");
  const international = raw.startsWith("+") || digits.startsWith("00");
  if (digits.startsWith("00")) digits = digits.slice(2);

  if (!international) {
    // Prefijo nacional: 055 9..., 099 123 456
    if (digits.startsWith("0")) digits = digits.slice(1);
    const uruguayWithCode = digits.length === 11 && digits.startsWith("598");
    if (!uruguayWithCode && (digits.length === 10 || digits.length === 11)) {
      // Brasil: DDD + número
      digits = `55${digits}`;
    } else if (digits.length === 8 && digits.startsWith("9")) {
      // Uruguay: celular 9X XXX XXX
      digits = `598${digits}`;
    }
  }

  if (/^55[1-9]{2}\d{8,9}$/.test(digits) || /^598\d{8}$/.test(digits)) return `+${digits}`;
  return null;
}

// El mismo celular de Brasil con y sin el 9 del principio. WhatsApp a veces manda el
// número de clientes viejos sin el 9 (+55 55 8111-2045 en vez de +55 55 98111-2045): para
// encontrar su cuenta o sus pedidos se buscan las dos formas.
export function phoneVariants(e164) {
  const match = /^\+55(\d{2})(\d{8,9})$/.exec(e164 ?? "");
  if (!match) return e164 ? [e164] : [];
  const [, ddd, local] = match;
  if (local.length === 9 && local.startsWith("9")) return [e164, `+55${ddd}${local.slice(1)}`];
  if (local.length === 8 && /^[6-9]/.test(local)) return [e164, `+55${ddd}9${local}`];
  return [e164];
}
