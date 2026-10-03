// Arma el documento OpenAPI 3.1 a partir del registro de endpoints y los schemas Zod.
import { z } from "zod";
import { errorResponse } from "../schemas/responses.schema.js";
import { operations } from "./operations.js";

// Los schemas de entrada se describen como los manda el cliente (antes de las
// transformaciones); los de salida, como los devuelve la API.
function jsonSchema(schema, io) {
  const { $schema, ...rest } = z.toJSONSchema(schema, { io, unrepresentable: "any" });
  return rest;
}

function parameters(schema, location) {
  if (!schema) return [];
  return Object.entries(schema.shape).map(([name, field]) => ({
    name,
    in: location,
    required: location === "path" || !field.safeParse(undefined).success,
    schema: jsonSchema(field, "input"),
  }));
}

function describeAuth(auth) {
  if (auth === "public") return "Sin sesión.";
  if (auth === "session") return "Con sesión.";
  if (auth === "customer") return "Con la sesión de cliente (cookie cliente).";
  return `Con sesión y el permiso \`${auth}\`.`;
}

function responses(op) {
  const result = {};
  for (const [status, schema] of Object.entries(op.responses)) {
    if (!schema) result[status] = { description: "Sin contenido" };
    else if (schema.binary) {
      const content = Object.fromEntries(schema.binary.map((type) => [type, { schema: { type: "string", format: "binary" } }]));
      result[status] = { description: "Archivo", content };
    } else {
      result[status] = { description: "OK", content: { "application/json": { schema: jsonSchema(schema, "output") } } };
    }
  }
  const error = { description: "Error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
  return { ...result, "4XX": error, "5XX": error };
}

export function buildOpenApi() {
  const paths = {};
  for (const op of operations) {
    const path = op.path.replace(/:(\w+)/g, "{$1}");
    const params = [...parameters(op.params, "path"), ...parameters(op.query, "query")];
    paths[path] ??= {};
    paths[path][op.method] = {
      tags: [op.tag],
      summary: op.summary,
      description: describeAuth(op.auth),
      ...(op.auth === "public" ? {} : { security: [op.auth === "customer" ? { customerSession: [] } : { session: [] }] }),
      ...(params.length ? { parameters: params } : {}),
      ...(op.body
        ? { requestBody: { required: true, content: { "application/json": { schema: jsonSchema(op.body, "input") } } } }
        : {}),
      responses: responses(op),
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "app-pedidos API",
      version: "1.0.0",
      description: "Plata en centavos de BRL. Errores: { error: { code, message, details? } }. Ver docs/api.md.",
    },
    servers: [{ url: "/" }],
    components: {
      securitySchemes: {
        session: { type: "apiKey", in: "cookie", name: "token" },
        customerSession: { type: "apiKey", in: "cookie", name: "cliente" },
      },
      schemas: { Error: jsonSchema(errorResponse, "output") },
    },
    paths,
  };
}
