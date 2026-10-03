// CSV simple (RFC 4180): comillas dobles, saltos de línea dentro de comillas, BOM de Excel.
// El separador por defecto es ";" porque Excel en portugués usa la coma como decimal.

// Detecta el separador mirando la primera línea: el que más aparece entre ";" y ",".
function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0];
  return (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
}

export function parseCsv(input) {
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === "") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Las líneas vacías no cuentan.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

const quote = (value, delimiter) => {
  const text = String(value ?? "");
  return /["\r\n]/.test(text) || text.includes(delimiter) ? `"${text.replaceAll('"', '""')}"` : text;
};

// Con BOM, para que Excel abra bien los acentos.
export function toCsv(rows, delimiter = ";") {
  return `﻿${rows.map((row) => row.map((cell) => quote(cell, delimiter)).join(delimiter)).join("\r\n")}\r\n`;
}
