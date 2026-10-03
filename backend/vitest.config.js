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
    },
  },
});
