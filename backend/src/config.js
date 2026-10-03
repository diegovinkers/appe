// Variables de entorno, validadas al arrancar: si falta algo, el servidor no levanta.
import { z } from "zod";

// Clave opcional: vacía en el .env cuenta como que no está.
const optionalSecret = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGO_URI: z.string({ error: "falta MONGO_URI" }).min(1, "falta MONGO_URI"),
  JWT_SECRET: z
    .string({ error: "falta JWT_SECRET" })
    .min(32, "JWT_SECRET tiene que tener al menos 32 caracteres"),
  // Orígenes permitidos por CORS, separados por coma (ej. http://localhost:5173).
  CORS_ORIGIN: z
    .string()
    .default("")
    .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean)),
  // Cantidad de proxies delante del servidor (0 = ninguno). Hace falta para que el
  // rate limit vea la IP real del cliente.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
  // Dirección del front: se usa para armar links (menú del local, QR, seguimiento).
  PUBLIC_WEB_URL: z
    .url({ protocol: /^https?$/, error: "PUBLIC_WEB_URL tiene que ser una URL http(s)" })
    .default("http://localhost:5173")
    .transform((url) => url.replace(/\/+$/, "")),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  // Opcional: sin esto, la subida de imágenes responde 503 y el resto funciona igual.
  CLOUDINARY_URL: z
    .string()
    .regex(/^cloudinary:\/\/\d+:[^@\s]+@[\w-]+$/, "CLOUDINARY_URL tiene que ser cloudinary://<api_key>:<api_secret>@<cloud_name>")
    .optional(),
  // Opcional: el asistente con IA (Claude, de Anthropic). Sin la clave, el asistente queda apagado.
  ANTHROPIC_API_KEY: optionalSecret,
  AI_MODEL: z.string().trim().min(1).default("claude-haiku-4-5-20251001"),
  // Opcional: WhatsApp Business (Cloud API de Meta), para que el asistente atienda por WhatsApp.
  WHATSAPP_ACCESS_TOKEN: optionalSecret,
  WHATSAPP_APP_SECRET: optionalSecret,
  WHATSAPP_VERIFY_TOKEN: optionalSecret,
  WHATSAPP_GRAPH_VERSION: z
    .string()
    .trim()
    .regex(/^v\d+\.\d+$/, "WHATSAPP_GRAPH_VERSION tiene que ser como v23.0")
    .default("v23.0"),
  // Audios de los clientes: "local" los pasa a texto en este servidor (Whisper, gratis); "none", no.
  TRANSCRIPTION_PROVIDER: z.enum(["local", "none"]).default("none"),
  // Modelo de Whisper para "local": base (76 MB, rápido) o onnx-community/whisper-small (241 MB, entiende mejor con ruido).
  WHISPER_MODEL: z.string().trim().min(1).default("onnx-community/whisper-base"),
  // Respuestas con voz: "local" las genera en este servidor (voces MMS, gratis); "none", solo texto.
  VOICE_PROVIDER: z.enum(["local", "none"]).default("none"),
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
  // Solo nombres de variables y el problema, nunca sus valores. console y no logger:
  // el logger necesita la config, que acá todavía no existe.
  const problems = result.error.issues.map((issue) => `- ${issue.path.join(".")}: ${issue.message}`);
  console.error(`Configuración inválida en .env:\n${problems.join("\n")}`);
  process.exit(1);
}

export const config = result.data;
export const isProduction = config.NODE_ENV === "production";
export const isTest = config.NODE_ENV === "test";
