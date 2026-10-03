const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// 7550 → "R$ 75,50". Ojo: entre "R$" y el número va un espacio no separable (U+00A0).
export const formatBRL = (cents) => brl.format(cents / 100);
