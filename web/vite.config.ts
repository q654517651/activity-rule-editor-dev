import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig({
  base: "./",
  plugins: [react(), tsconfigPaths(), tailwindcss()],
  server: {
    allowedHosts: [
      ".ngrok-free.dev",
      ".ngrok.io",
      ".ngrok.app",
      ".trycloudflare.com",
    ],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/media": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
