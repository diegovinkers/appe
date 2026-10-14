import { normalize } from "../../../lib/text";

// "Ponto da carne ", "ponto  da Carne" y "Ponto-da-carne" son el mismo nombre.
export const groupKey = (name: string) =>
  normalize(name)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// Cuántas letras hay que cambiar para pasar de un nombre al otro.
function distance(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
}

// Los grupos con un nombre parecido al que se está escribiendo: igual, uno adentro del otro
// ("Ponto" y "Ponto da carne") o con una o dos letras distintas ("Adicional" y "Adicionais").
export function similarGroups<T extends { name: string }>(name: string, groups: T[]): T[] {
  const key = groupKey(name);
  if (key.length < 3) return [];
  return groups.filter((group) => {
    const other = groupKey(group.name);
    if (!other) return false;
    if (other === key) return true;
    const shorter = Math.min(key.length, other.length);
    if (shorter >= 4 && (other.includes(key) || key.includes(other))) return true;
    return shorter >= 5 && distance(key, other) <= (shorter >= 9 ? 2 : 1);
  });
}

// Los grupos repetidos: mismo nombre sin contar mayúsculas, acentos ni espacios. Cada lista
// tiene dos o más grupos, para juntarlos en uno.
export function duplicateSets<T extends { name: string }>(groups: T[]): T[][] {
  const byName = new Map<string, T[]>();
  for (const group of groups) {
    const key = groupKey(group.name);
    byName.set(key, [...(byName.get(key) ?? []), group]);
  }
  return [...byName.values()].filter((list) => list.length > 1);
}
