// Dinero que escribe una persona: "25", "25,90", "25.90" o "R$ 1.025,90" → centavos.
// null si está vacío o no es un número.
export function parseMoney(value: string): number | null {
  let cleaned = value.replace(/[^\d,.]/g, "");
  if (!cleaned) return null;
  // Con coma, la coma es el decimal y los puntos son de miles ("1.025,90").
  if (cleaned.includes(",")) cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

// Centavos → "25,90", para mostrar en un campo que se puede editar.
export const centsToInput = (cents: number | null | undefined) => (cents == null ? "" : (cents / 100).toFixed(2).replace(".", ","));
