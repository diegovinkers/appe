import { createHmac } from "node:crypto";
import twilio from "twilio";
import { describe, expect, it } from "vitest";
import { inboundMessages, twilioInboundMessages } from "../../src/services/assistant/whatsapp.js";
import { splitText, validSignature, validTwilioSignature } from "../../src/services/assistant/whatsappCloud.js";

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

it("con el límite de Twilio, en partes de hasta 1600", () => {
  const text = Array(60).fill("x".repeat(99)).join("\n");
  const parts = splitText(text, 1600);
  expect(parts.length).toBe(4);
  expect(parts.every((part) => part.length <= 1600)).toBe(true);
  expect(parts.join("\n")).toBe(text);
});

describe("Twilio", () => {
  const url = "https://prueba.ngrok-free.app/api/whatsapp/twilio";
  const params = { MessageSid: "SM1", From: "whatsapp:+5555999991234", To: "whatsapp:+14155238886", Body: "oi" };

  it("acepta solo lo firmado con nuestro Auth Token para la URL configurada", () => {
    const good = twilio.getExpectedTwilioSignature("token-de-twilio-de-prueba", url, params);
    expect(validTwilioSignature(good, params)).toBe(true);
    expect(validTwilioSignature(good, { ...params, Body: "otro" })).toBe(false);
    expect(validTwilioSignature(twilio.getExpectedTwilioSignature("otro-token", url, params), params)).toBe(false);
    expect(validTwilioSignature(twilio.getExpectedTwilioSignature("token-de-twilio-de-prueba", "https://otro.ngrok-free.app/api/whatsapp/twilio", params), params)).toBe(false);
    expect(validTwilioSignature(undefined, params)).toBe(false);
    expect(validTwilioSignature(good, undefined)).toBe(false);
  });

  it("cada POST, con la misma forma que lo de Meta", () => {
    const media = (type) => ({ ...params, Body: "", NumMedia: "1", MediaUrl0: "https://api.twilio.com/m/1", MediaContentType0: type });
    expect(twilioInboundMessages({ ...params, ProfileName: "Maria" })).toEqual([
      { phoneNumberId: "14155238886", waId: "5555999991234", name: "Maria", message: { id: "SM1", type: "text", text: { body: "oi" } } },
    ]);
    expect(twilioInboundMessages(media("audio/ogg"))[0].message).toMatchObject({ type: "audio", audio: { id: "https://api.twilio.com/m/1" } });
    expect(twilioInboundMessages(media("image/jpeg"))[0].message.type).toBe("image");
    expect(twilioInboundMessages(media("application/pdf"))[0].message.type).toBe("document");
    expect(twilioInboundMessages({ ...params, Body: "", Latitude: "-30.38" })[0].message.type).toBe("location");
    // Un SMS al mismo número, o algo sin id, no es de WhatsApp.
    expect(twilioInboundMessages({ ...params, From: "+5555999991234" })).toEqual([]);
    expect(twilioInboundMessages({ ...params, MessageSid: undefined })).toEqual([]);
  });
});
