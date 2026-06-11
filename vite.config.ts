import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages (https://abehiroshi.github.io/ablearn/) 配信のため base を設定。
// マルチエントリ構成（計画22）:
//   /ablearn/         → コレクション一覧のランディング（index.html・静的）
//   /ablearn/chugaku/ → 中学教科書コレクション（chugaku/index.html・Reactアプリ）
// コレクションを増やすときは <id>/index.html を作って input に足す。
export default defineConfig({
  base: "/ablearn/",
  build: {
    rollupOptions: {
      input: {
        landing: resolve(__dirname, "index.html"),
        chugaku: resolve(__dirname, "chugaku/index.html"),
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      // マニフェストはコレクションごとの静的ファイル
      // （public/manifest-<collection>.webmanifest）を各 HTML が参照する
      manifest: false,
      workbox: {
        // アプリ本体はプリキャッシュ、コンテンツJSONはネットワーク優先で常に最新を取りに行く
        globPatterns: ["**/*.{js,css,html,png,svg,webp,webmanifest}"],
        // コレクションごとの index.html がプリキャッシュされるので
        // 一律のフォールバックはしない（landing が誤って出るのを防ぐ）
        navigateFallback: null,
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
