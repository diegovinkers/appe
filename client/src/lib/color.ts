// Color del texto que se lee bien sobre un fondo: blanco o tinta, según la luminancia
// relativa (WCAG). Se usa con los colores de cada local, que pueden ser cualquiera.
const INK = "#1b2420";
const WHITE = "#ffffff";

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

export function readableTextOn(background: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(background)) return WHITE;
  const bg = luminance(background);
  return contrast(bg, luminance(WHITE)) >= contrast(bg, luminance(INK)) ? WHITE : INK;
}

// "Burger Demo" → "BD"; "Lanches" → "LA".
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}
