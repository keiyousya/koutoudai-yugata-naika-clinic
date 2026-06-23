import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      pwaAssets: {
        config: true,
      },
      manifest: {
        name: "院内ミキサー",
        short_name: "ミキサー",
        description: "院内放送用のマイク・音楽ミキサー",
        lang: "ja",
        display: "standalone",
        orientation: "portrait",
        theme_color: "#252525",
        background_color: "#252525",
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  base: "/mixer/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5176,
  },
});
