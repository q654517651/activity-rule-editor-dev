import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/activity-rule-editor/",
  plugins: [react(), tsconfigPaths(), tailwindcss()],
  server: {
    host: "0.0.0.0",
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
