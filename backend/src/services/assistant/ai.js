// Proveedor de IA del asistente, detrás de una sola interfaz para poder cambiar de
// proveedor o de modelo sin tocar el resto:
//
//   complete({ system: [{ text, cache }], messages, tools, maxTokens })
//     → { content: [{ type: "text", text } | { type: "tool_use", id, name, input }],
//         stopReason, model, usage: { inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens } }
//
// `messages` y `tools` van en el formato de la API de Anthropic. Los tests ponen uno
// falso con setAiProvider(): nunca llaman a la API real.
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config.js";

let override;
let fromConfig;

// La última parte de la conversación queda en la caché: la llamada siguiente del mismo
// turno (después de usar una herramienta) relee todo lo anterior a un 10% del precio.
function withCacheBreakpoint(messages) {
  if (!messages.length) return messages;
  const last = messages.at(-1);
  const blocks = typeof last.content === "string" ? [{ type: "text", text: last.content }] : last.content;
  const marked = blocks.map((block, index) =>
    index === blocks.length - 1 ? { ...block, cache_control: { type: "ephemeral" } } : block
  );
  return [...messages.slice(0, -1), { ...last, content: marked }];
}

function anthropicProvider({ apiKey, model }) {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  return {
    name: "anthropic",
    model,
    async complete({ system, messages, tools, maxTokens = 1024 }) {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: system.map(({ text, cache }) => ({
          type: "text",
          text,
          ...(cache && { cache_control: { type: "ephemeral" } }),
        })),
        messages: withCacheBreakpoint(messages),
        tools,
      });
      const usage = response.usage ?? {};
      return {
        content: response.content
          .filter((block) => block.type === "text" || block.type === "tool_use")
          .map((block) =>
            block.type === "text"
              ? { type: "text", text: block.text }
              : { type: "tool_use", id: block.id, name: block.name, input: block.input }
          ),
        stopReason: response.stop_reason,
        model: response.model ?? model,
        usage: {
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
          cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        },
      };
    },
  };
}

// El proveedor configurado, o null si no hay (sin ANTHROPIC_API_KEY el asistente no contesta).
export function getAiProvider() {
  if (override !== undefined) return override;
  if (!config.ANTHROPIC_API_KEY) return null;
  fromConfig ??= anthropicProvider({ apiKey: config.ANTHROPIC_API_KEY, model: config.AI_MODEL });
  return fromConfig;
}

// Para los tests: un proveedor falso, null (sin IA) o undefined (volver al de la config).
export function setAiProvider(provider) {
  override = provider;
}
