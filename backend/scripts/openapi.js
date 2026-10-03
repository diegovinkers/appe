// Genera docs/openapi.json desde el registro de endpoints (src/docs/operations.js).
// Uso: npm run openapi. No necesita .env ni base de datos.
import { writeFileSync } from "node:fs";
import { buildOpenApi } from "../src/docs/openapi.js";

const target = new URL("../docs/openapi.json", import.meta.url);
writeFileSync(target, `${JSON.stringify(buildOpenApi(), null, 2)}\n`);
console.log("docs/openapi.json actualizado");
