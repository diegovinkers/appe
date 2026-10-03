// Aplica al documento los textos en español campo por campo, sin borrar los que no vienen.
export function setTranslations(doc, translations) {
  for (const [field, value] of Object.entries(translations?.es ?? {})) doc.set(`translations.es.${field}`, value);
}

// Lo mismo para un $set de Mongo: { "translations.es.name": "..." }.
export function translationPaths(translations) {
  return Object.fromEntries(
    Object.entries(translations?.es ?? {}).map(([field, value]) => [`translations.es.${field}`, value])
  );
}

// Texto en el idioma pedido: el español si existe; si no, el portugués.
export const localized = (doc, field, lang) =>
  (lang === "es" && doc.translations?.es?.[field]) || doc[field];
