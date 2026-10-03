// Lee un CSV como texto. Excel en Windows suele guardarlo en windows-1252 (no UTF-8):
// si el UTF-8 no es válido, se lee con esa codificación para no romper los acentos.
export async function readCsvFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
