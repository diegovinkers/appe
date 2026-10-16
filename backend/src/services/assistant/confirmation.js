// "Sim", "confirmo", "dale", "👍": una respuesta que solo confirma, en portugués, español o
// portuñol. Con algo más ("sim, mas sem cebola", "sí, agregá papas") no es solo confirmar y
// la contesta la IA. Las palabras van sin tildes: el texto se compara sin ellas.
const AFFIRM = new Set([
  "sim", "si", "s", "confirmo", "confirmado", "confirma", "confirmar", "confirmamos", "ok", "okay", "okey", "oki", "isso", "certo",
  "certinho", "perfeito", "beleza", "blz", "bora", "fechado", "fecha", "manda", "mande", "mandar", "envia", "enviar", "envie",
  "dale", "listo", "correcto", "claro", "exacto", "exato", "yes", "vale", "joia", "show", "top", "positivo",
]);
// Lo que acompaña sin cambiar el sentido ("pode mandar", "sí, por favor", "ok obrigado").
const FILLER = new Set([
  "pode", "podes", "puede", "por", "favor", "pf", "pfv", "porfa", "pls", "obrigado", "obrigada", "obg", "valeu", "gracias",
  "esta", "ta", "tudo", "todo", "bien", "bem", "de", "acuerdo", "acordo", "pedido", "o", "el", "lo", "e", "es", "ai", "eu", "yo",
  "pra", "para", "mim", "agora", "ahora", "ja", "ya",
]);
const THUMBS = /[\u{1F44D}\u{1F44C}✅✔]/gu;

export function isConfirmation(text) {
  const words = String(text ?? "")
    .toLowerCase()
    .replace(THUMBS, " ok ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length || words.length > 6) return false;
  return words.some((word) => AFFIRM.has(word)) && words.every((word) => AFFIRM.has(word) || FILLER.has(word));
}
