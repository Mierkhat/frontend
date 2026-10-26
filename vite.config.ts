import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import copy from "./copy/src/en.json" with { type: "json" };
export default defineConfig({
  plugins: [
    react(),
    {
      name: "mierkhat-metadata",
      transformIndexHtml(html) {
        return html
          .replace("%TITLE%", copy["title.home"])
          .replace("%ALT%", copy["brand.alt"]);
      },
    },
  ],
  server: { host: "0.0.0.0", proxy: { "/v1": "http://127.0.0.1:3001" } },
  preview: { host: "0.0.0.0" },
  build: { chunkSizeWarningLimit: 1100 },
});
