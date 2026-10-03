// De la respuesta escrita a un texto para leer en voz alta. Las voces locales (MMS) no
// leen números ni símbolos: precios, cantidades y horas pasan a palabras, y los links, los
// emojis y el formato de WhatsApp se sacan.

const PT = {
  units: ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"],
  tens: ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"],
  hundreds: ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"],
  hundred: "cem",
  and: " e ",
  thousand: "mil",
};

const ES = {
  units: ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve"],
  twenties: ["veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"],
  tens: ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"],
  hundreds: ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"],
  hundred: "cien",
  and: " y ",
  thousand: "mil",
};

function belowThousand(n, words, es) {
  if (n < 20) return words.units[n];
  if (es && n < 30) return words.twenties[n - 20];
  if (n < 100) return words.tens[Math.floor(n / 10)] + (n % 10 ? words.and + words.units[n % 10] : "");
  if (n === 100) return words.hundred;
  const rest = n % 100;
  // Portugués: "cento e vinte"; español: "ciento veinte".
  return words.hundreds[Math.floor(n / 100)] + (rest ? (es ? " " : words.and) + belowThousand(rest, words, es) : "");
}

// En español, "uno" delante de un sustantivo es "un" ("treinta y un reales", "veintiún mil").
const beforeNoun = (words, locale) => (locale === "es" ? words.replace(/veintiuno$/, "veintiún").replace(/uno$/, "un") : words);

// Un número entero en palabras (hasta 999.999).
export function numberToWords(n, locale = "pt-BR") {
  const es = locale === "es";
  const words = es ? ES : PT;
  if (!Number.isInteger(n) || n < 0 || n > 999_999) return String(n);
  if (n < 1000) return belowThousand(n, words, es);
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const head = thousands === 1 ? words.thousand : `${beforeNoun(belowThousand(thousands, words, es), locale)} ${words.thousand}`;
  if (!rest) return head;
  // "mil e duzentos" / "dois mil trezentos e quarenta": "e" si el resto es chico o redondo.
  const joiner = !es && (rest < 100 || rest % 100 === 0) ? words.and : " ";
  return head + joiner + belowThousand(rest, words, es);
}

// "R$ 31,90" → "trinta e um reais e noventa centavos".
export function moneyToWords(reais, cents, locale = "pt-BR") {
  const es = locale === "es";
  const parts = [];
  if (reais > 0 || cents === 0) parts.push(`${beforeNoun(numberToWords(reais, locale), locale)} ${reais === 1 ? "real" : es ? "reales" : "reais"}`);
  if (cents > 0) parts.push(`${beforeNoun(numberToWords(cents, locale), locale)} ${cents === 1 ? "centavo" : "centavos"}`);
  return parts.join(es ? " con " : " e ");
}

const LINK = { "pt-BR": "o link está na mensagem", es: "el link está en el mensaje" };

/**
 * El texto de una respuesta, listo para una voz sin números ni símbolos.
 * @param {string} text  Tal como sale por WhatsApp (con *negrita*, links y emojis).
 * @param {"pt-BR"|"es"} locale
 */
export function speechText(text, locale = "pt-BR") {
  const es = locale === "es";
  const money = (value) => {
    const [reais, cents = "0"] = value.replace(/\./g, "").split(",");
    return moneyToWords(Number(reais), Number(cents.padEnd(2, "0").slice(0, 2)), locale);
  };
  return (
    text
      .replace(/https?:\/\/\S+/g, LINK[locale] ?? LINK["pt-BR"])
      .replace(/[*_~`]/g, "")
      .replace(/\p{Extended_Pictographic}|️/gu, "")
      .replace(/R\$\s*([\d.]+(?:,\d{1,2})?)/g, (_, value) => money(value))
      .replace(/#\s?(\d+)/g, (_, n) => `número ${n}`)
      .replace(/(\d+)\s*[–-]\s*(\d+)\s*min\b/g, (_, a, b) => `${a} a ${b} minutos`)
      .replace(/\bmin\b/g, "minutos")
      .replace(/(\d{1,2}):(\d{2})/g, (_, h, m) => (m === "00" ? h : `${h}${es ? " y " : " e "}${m}`))
      .replace(/\d+/g, (n) => numberToWords(Number(n), locale))
      // Saltos de línea y viñetas: pausas.
      .replace(/\s*\n+\s*/g, ". ")
      .replace(/\s{2,}/g, " ")
      .replace(/(\.\s*){2,}/g, ". ")
      .trim()
  );
}

// Una respuesta se lee en voz alta solo si es corta: el resumen del pedido va por escrito.
export const shouldSpeak = (text) => text.length <= 400 && text.split("\n").filter((line) => line.trim()).length <= 5;
