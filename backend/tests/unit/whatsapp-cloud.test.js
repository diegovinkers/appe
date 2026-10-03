import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { inboundMessages } from "../../src/services/assistant/whatsapp.js";
import { splitText, validSignature } from "../../src/services/assistant/whatsappCloud.js";

describe("firma del webhook", () => {
  const raw = Buffer.from('{"object":"whatsapp_business_account"}');
  const good = `sha256=${createHmac("sha256", "secreto-de-prueba").update(raw).digest("hex")}`;

  it("acepta solo lo firmado con nuestro App Secret", () => {
    expect(validSignature(raw, good)).toBe(true);
    expect(validSignature(Buffer.from('{"object":"otro"}'), good)).toBe(false);
    expect(validSignature(raw, `sha256=${createHmac("sha256", "otro-secreto").update(raw).digest("hex")}`)).toBe(false);
    expect(validSignature(raw, "sha256=abc")).toBe(false);
    expect(validSignature(raw, undefined)).toBe(false);
    expect(validSignature(undefined, good)).toBe(false);
  });
});

describe("lo que llega por el webhook", () => {
  it("saca cada mensaje con el número del local y el nombre del cliente; ignora los avisos de entrega", () => {
    const body = {
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "111" },
                contacts: [{ wa_id: "5555999991234", profile: { name: "Maria" } }],
                messages: [{ from: "5555999991234", id: "wamid.1", type: "text", text: { body: "oi" } }],
                statuses: [{ id: "wamid.0", status: "read" }],
              },
            },
            { field: "account_update", value: {} },
          ],
        },
      ],
    };
    expect(inboundMessages(body)).toEqual([
      { phoneNumberId: "111", waId: "5555999991234", name: "Maria", message: { from: "5555999991234", id: "wamid.1", type: "text", text: { body: "oi" } } },
    ]);
    expect(inboundMessages({})).toEqual([]);
  });
});

it("un texto largo sale en varios mensajes, cortando en un salto de línea", () => {
  const line = "x".repeat(99);
  const text = Array(60).fill(line).join("\n");
  const parts = splitText(text);
  expect(parts.length).toBe(2);
  expect(parts.every((part) => part.length <= 4000)).toBe(true);
  expect(parts.join("\n")).toBe(text);
  expect(splitText("  oi  ")).toEqual(["oi"]);
});
