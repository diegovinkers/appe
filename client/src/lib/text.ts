// Para buscar sin importar mayúsculas ni acentos: "pao" encuentra "Pão".
export const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// Todas las palabras de la búsqueda tienen que estar en el texto, en cualquier orden.
export function matchesSearch(text: string, search: string) {
  const haystack = normalize(text);
  return normalize(search)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}
