import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Un MongoDB en memoria para toda la corrida; cada archivo usa su propia base.
    globalSetup: ["./tests/global-setup.js"],
    setupFiles: ["./tests/setup.js"],
    hookTimeout: 120_000,
    env: {
      NODE_ENV: "test",
      MONGO_URI: "sin-uso-en-tests",
      JWT_SECRET: "secreto-solo-para-tests-0123456789-abcdefghij",
      CORS_ORIGIN: "http://localhost:5173",
      BCRYPT_ROUNDS: "4",
      // Cloudinary de mentira: nunca se llama a la API real desde los tests.
      CLOUDINARY_URL: "cloudinary://123456789012345:falso@nube-de-prueba",
      // WhatsApp de mentira: los tests ponen un cliente falso (setWhatsappClient), nunca Meta.
      WHATSAPP_ACCESS_TOKEN: "token-de-prueba",
      WHATSAPP_APP_SECRET: "secreto-de-prueba",
      WHATSAPP_VERIFY_TOKEN: "verificacion-de-prueba",
      // Twilio de mentira (los tests de Twilio cambian WHATSAPP_PROVIDER a "twilio").
      TWILIO_ACCOUNT_SID: "AC00000000000000000000000000000000",
      TWILIO_AUTH_TOKEN: "token-de-twilio-de-prueba",
      TWILIO_WEBHOOK_URL: "https://prueba.ngrok-free.app/api/whatsapp/twilio",
      // 360dialog de mentira (los tests de 360dialog cambian WHATSAPP_PROVIDER a "360dialog").
      D360_API_KEY: "key-de-360dialog-de-prueba",
      D360_WEBHOOK_TOKEN: "secreto-del-webhook-de-prueba",
      D360_PHONE_NUMBER: "551146733492",
    },
  },
});
