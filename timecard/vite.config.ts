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
        name: "タイムカード",
        short_name: "タイムカード",
        description: "クリニックのスタッフ出退勤管理",
        lang: "ja",
        display: "standalone",
        orientation: "portrait",
        theme_color: "#84B7D7",
        background_color: "#ffffff",
      },
      workbox: {
        // NFC 打刻 API（別オリジンの Workers）はキャッシュせず、
        // ビルド成果物のみをプリキャッシュする
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  base: "/timecard/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5175,
  },
});
