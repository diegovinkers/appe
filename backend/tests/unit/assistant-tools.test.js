import { describe, expect, it } from "vitest";
import { TOOLS } from "../../src/services/assistant/tools.js";

// Con strict, la API rechaza el schema si un objeto no cierra sus campos o si usa límites que no soporta.
function objects(schema, path = "input_schema") {
  if (!schema || typeof schema !== "object") return [];
  const own = schema.type === "object" ? [[path, schema]] : [];
  const nested = Object.entries(schema.properties ?? {}).flatMap(([key, value]) => objects(value, `${path}.${key}`));
  return [...own, ...nested, ...objects(schema.items, `${path}[]`)];
}

describe("herramientas del asistente", () => {
  it("son strict: la IA no puede omitir campos obligatorios", () => {
    for (const tool of TOOLS) {
      expect(tool.strict, tool.name).toBe(true);
      for (const [path, schema] of objects(tool.input_schema)) {
        expect(schema.additionalProperties, `${tool.name} ${path}`).toBe(false);
      }
      expect(JSON.stringify(tool.input_schema), tool.name).not.toMatch(/"(minimum|maximum|minItems|maxItems|minLength|maxLength)"/);
    }
  });
});
