/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // En desarrollo la API se sirve desde el mismo origen: la cookie de sesión anda sin CORS.
    proxy: { "/api": "http://localhost:4000" },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
