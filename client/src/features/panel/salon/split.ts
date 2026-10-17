// Dividir la cuenta en partes iguales, en centavos: lo que no divide justo va a las primeras
// partes, de a un centavo (R$ 10,00 en 3 = 3,34 + 3,33 + 3,33).
export function splitEqually(totalCents: number, parts: number): number[] {
  const base = Math.floor(totalCents / parts);
  const rest = totalCents - base * parts;
  return Array.from({ length: parts }, (_, index) => base + (index < rest ? 1 : 0));
}
