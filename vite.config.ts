import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages (https://abehiroshi.github.io/ablearn/) 配信のため base を設定
export default defineConfig({
  base: "/ablearn/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "Ablearn - 定期テスト対策",
        short_name: "Ablearn",
        description: "中学生の定期テスト対策アプリ",
        lang: "ja",
        start_url: "/ablearn/",
        scope: "/ablearn/",
        display: "standalone",
        background_color: "#f2f2f7",
        theme_color: "#4f7cff",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // アプリ本体はプリキャッシュ、コンテンツJSONはネットワーク優先で常に最新を取りに行く
        globPatterns: ["**/*.{js,css,html,png,svg}"],
        runtimeCaching: [
          {
            urlPattern: /\/content\/.*\.json$/,
            handler: "NetworkFirst",
            options: {
              cacheName: "ablearn-content",
              expiration: { maxEntries: 200 },
            },
          },
        ],
      },
    }),
  ],
});
